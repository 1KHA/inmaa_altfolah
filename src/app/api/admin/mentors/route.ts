import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { dispatchNotification } from '@/lib/notify';
import { verifyToken, requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

// Fields safe to send to the browser — excludes passwordHash. This list is
// shared by both the list and single-mentor lookup below.
const MENTOR_PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  specialty: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  isDisabled: true,
  disabledAt: true,
} as const;

/**
 * GET is read by BOTH the admin mentors page and the participant mentors page
 * (participants browse mentors before booking), so it accepts any signed-in
 * user rather than admins only. It never returns passwordHash.
 */
export async function GET(request: NextRequest) {
  const claims = verifyToken(cookies().get('token')?.value);
  if (!claims) {
    return NextResponse.json({ message: 'غير مصرح' }, { status: 401 });
  }

  // Admins must still see disabled mentors (to re-enable them); everyone else
  // — i.e. participants browsing before booking — must not.
  const isAdmin = claims.role === 'admin';
  const visibility = isAdmin ? {} : { isDisabled: false };

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  try {
    if (id) {
      const mentor = await prisma.mentor.findFirst({
        where: { id, ...visibility },
        select: MENTOR_PUBLIC_FIELDS,
      });

      if (!mentor) {
        return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
      }

      return NextResponse.json(mentor);
    } else {
      // Participants only need the plain list. Admins additionally get the
      // real stats the mentors table shows — these used to be Math.random()
      // mock values generated in the browser and re-rolled on every fetch.
      if (!isAdmin) {
        // Participants browse mentors before booking, so they get a REAL
        // availability summary computed from future slots — but never team
        // names, session counts, or any other participant's data (the page
        // used to fabricate this with Math.random()).
        const rows = await prisma.mentor.findMany({
          where: visibility,
          select: {
            ...MENTOR_PUBLIC_FIELDS,
            availabilities: {
              select: { endTime: true, bookings: { select: { status: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        const now = new Date();
        const mentors = rows.map(({ availabilities, ...mentor }) => {
          const future = availabilities.filter((a) => a.endTime >= now);
          const freeSlots = future.filter(
            (a) => !a.bookings.some((b) => b.status !== 'cancelled')
          ).length;
          let availability: string | null = null;
          if (future.length > 0) {
            if (freeSlots === future.length) availability = 'متاح';
            else if (freeSlots === 0) availability = 'مشغول';
            else availability = 'متاح جزئياً';
          }
          return { ...mentor, availability, availableSlots: freeSlots, upcomingSlots: future.length };
        });
        return NextResponse.json(mentors);
      }

      const rows = await prisma.mentor.findMany({
        where: visibility,
        select: {
          ...MENTOR_PUBLIC_FIELDS,
          availabilities: {
            select: {
              endTime: true,
              bookings: {
                select: {
                  status: true,
                  participant: { select: { teamId: true, team: { select: { teamName: true } } } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      const mentors = rows.map(({ availabilities, ...mentor }) => {
        // A booking counts as a session unless it was cancelled.
        const active = availabilities.flatMap((a) =>
          a.bookings.filter((b) => b.status !== 'cancelled').map((b) => ({ ...b, endTime: a.endTime }))
        );

        // Teams this mentor actually works with, via who booked them. There is
        // no explicit mentor↔team assignment in the schema, so bookings are the
        // only real link — see mdfiles/mentor-stats.md.
        const teamNames = Array.from(
          new Set(
            active
              .map((b) => b.participant?.team?.teamName)
              .filter((t): t is string => Boolean(t))
          )
        );

        // Availability is derived from FUTURE slots only; a past slot says
        // nothing about whether the mentor is free now.
        const future = availabilities.filter((a) => a.endTime >= now);
        const freeSlots = future.filter(
          (a) => !a.bookings.some((b) => b.status !== 'cancelled')
        ).length;
        let availability: string | null = null;
        if (future.length > 0) {
          if (freeSlots === future.length) availability = 'متاح';
          else if (freeSlots === 0) availability = 'مشغول';
          else availability = 'متاح جزئياً';
        }

        return {
          ...mentor,
          assignedTeams: teamNames.length,
          teams: teamNames,
          // `completed` is never written by any route, so "completed" means a
          // non-cancelled booking whose slot has already ended.
          sessionsCompleted: active.filter((b) => b.endTime < now).length,
          sessionsUpcoming: active.filter((b) => b.endTime >= now).length,
          sessionsTotal: active.length,
          availability,
          availableSlots: freeSlots,
          upcomingSlots: future.length,
        };
      });

      return NextResponse.json(mentors);
    }
  } catch (error) {
    console.error('Error fetching mentors:', error);
    return NextResponse.json({ message: 'Failed to fetch mentors' }, { status: 500 });
  }
}

// POST/PUT/DELETE create, edit, and delete mentor accounts — admin only.
export async function POST(request: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { name, email, specialty, phone, password } = body;

    if (!name || !email || !specialty || !phone || !password) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newMentor = await prisma.mentor.create({
      data: {
        name,
        email,
        specialty,
        phone,
        passwordHash,
      },
      select: MENTOR_PUBLIC_FIELDS,
    });

    // Notify admins that a new mentor was added
    try {
      await dispatchNotification({
        templateKey: 'newMentorRegistration',
        variables: { mentorName: newMentor.name },
        audience: { kind: 'admins' },
        relatedEntityType: 'mentor',
        relatedEntityId: newMentor.id,
      });
    } catch (notificationError) {
      console.error('Error creating mentor registration notification:', notificationError);
      // Don't fail the creation if notification fails
    }

    return NextResponse.json(newMentor, { status: 201 });
  } catch (error) {
    console.error('Error creating mentor:', error);
    // Check for unique constraint violation
    if ((error as any).code === 'P2002' && (error as any).meta?.target?.includes('email')) {
      return NextResponse.json({ message: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to create mentor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id, name, email, specialty, phone, status } = body;

    if (!id) {
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    // Read the current status first so approval can be detected as a transition
    // rather than firing on every unrelated edit
    const existingMentor = await prisma.mentor.findUnique({
      where: { id },
      select: { status: true },
    });

    const updatedMentor = await prisma.mentor.update({
      where: { id },
      data: {
        name,
        email,
        specialty,
        phone,
        status,
      },
      select: MENTOR_PUBLIC_FIELDS,
    });

    // Notify the mentor only when they have just been approved
    if (existingMentor && existingMentor.status !== 'active' && updatedMentor.status === 'active') {
      try {
        await dispatchNotification({
          templateKey: 'mentorProfileApproval',
          audience: { kind: 'mentor', id: updatedMentor.id },
          relatedEntityType: 'mentor',
          relatedEntityId: updatedMentor.id,
        });
      } catch (notificationError) {
        console.error('Error creating mentor approval notification:', notificationError);
        // Don't fail the update if notification fails
      }
    }

    return NextResponse.json(updatedMentor);
  } catch (error) {
    console.error('Error updating mentor:', error);
    if ((error as any).code === 'P2002' && (error as any).meta?.target?.includes('email')) {
      return NextResponse.json({ message: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to update mentor' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json({ message: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: 'Mentor ID is required' }, { status: 400 });
    }

    await prisma.mentor.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Mentor deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting mentor:', error);
    return NextResponse.json({ message: 'Failed to delete mentor' }, { status: 500 });
  }
}
