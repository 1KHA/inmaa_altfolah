import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { requireActiveMentor } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mentorId = searchParams.get('mentorId');

    // Booking rows include participant names/emails/phones, so access is
    // restricted: admins may query any mentor via ?mentorId=, a mentor may
    // only read their own bookings, and participants are not allowed at all.
    const cookieStore = cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'غير مصرح. يرجى تسجيل الدخول.' },
        { status: 401 }
      );
    }

    let decoded: { id?: string; role?: string };
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id?: string; role?: string };
    } catch (error) {
      return NextResponse.json(
        { error: 'رمز المصادقة غير صالح.' },
        { status: 401 }
      );
    }

    let targetMentorId: string | null = null;
    if (decoded.role === 'admin') {
      targetMentorId = mentorId;
    } else if (decoded.role === 'mentor' && decoded.id) {
      // A mentor always reads their own bookings; a mentorId param, if sent,
      // must be their own.
      if (mentorId && mentorId !== decoded.id) {
        return NextResponse.json(
          { error: 'غير مصرح. لا يمكنك عرض حجوزات موجه آخر.' },
          { status: 403 }
        );
      }
      targetMentorId = decoded.id;
      const blocked_ = await requireActiveMentor(decoded.id);
      if (blocked_) return blocked_;

    } else {
      return NextResponse.json(
        { error: 'غير مصرح. هذه الخدمة متاحة للموجهين والمسؤولين فقط.' },
        { status: 403 }
      );
    }

    if (!targetMentorId) {
      return NextResponse.json(
        { error: 'يجب توفير معرف الموجه.' },
        { status: 400 }
      );
    }
    
    // First, get all availability slots for the mentor
    const availabilities = await (prisma as any).mentorAvailability.findMany({
      where: {
        mentorId: targetMentorId,
      },
      include: {
        mentor: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        bookings: {
          include: {
            organization: { select: { id: true, name: true, logoUrl: true } },
            participant: {
              select: {
                id: true,
                firstName: true,
                secondName: true,
                familyName: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });
    
    // Format the response to include all bookings with availability and participant details
    const bookings = availabilities.flatMap((availability: any) => 
      availability.bookings.map((booking: any) => ({
        id: booking.id,
        status: booking.status,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        meetingUrl: booking.meetingUrl ?? null,
        availability: {
          id: availability.id,
          startTime: availability.startTime,
          endTime: availability.endTime,
        },
        participant: {
          id: booking.participant.id,
          name: booking.participant.fullName || [booking.participant.firstName, booking.participant.secondName, booking.participant.familyName].filter(Boolean).join(' ').trim() || booking.participant.email,
          email: booking.participant.email,
          phoneNumber: booking.participant.phoneNumber,
        },
        mentor: {
          id: availability.mentor.id,
          name: availability.mentor.name,
          specialty: availability.mentor.specialty,
        },
        organization: booking.organization ?? null,
        viaOrganization: Boolean(booking.organizationId),
        hostedByMe: true,
      }))
    );

    // Organization bookings hosted by a COLLEAGUE's slot still concern this
    // mentor (every member was notified and may attend) — list them too.
    const me = await prisma.mentor.findUnique({ where: { id: targetMentorId }, select: { organizationId: true } });
    if (me?.organizationId) {
      const colleagueBookings = await (prisma as any).mentorBooking.findMany({
        where: {
          organizationId: me.organizationId,
          availability: { mentorId: { not: targetMentorId } },
        },
        include: {
          organization: { select: { id: true, name: true, logoUrl: true } },
          participant: { select: { id: true, firstName: true, secondName: true, familyName: true, fullName: true, email: true, phoneNumber: true } },
          availability: { include: { mentor: { select: { id: true, name: true, specialty: true } } } },
        },
        orderBy: { availability: { startTime: 'asc' } },
      });
      for (const b of colleagueBookings) {
        bookings.push({
          id: b.id,
          status: b.status,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          meetingUrl: b.meetingUrl ?? null,
          availability: { id: b.availability.id, startTime: b.availability.startTime, endTime: b.availability.endTime },
          participant: {
            id: b.participant.id,
            name: b.participant.fullName || [b.participant.firstName, b.participant.secondName, b.participant.familyName].filter(Boolean).join(' ').trim() || b.participant.email,
            email: b.participant.email,
            phoneNumber: b.participant.phoneNumber,
          },
          mentor: { id: b.availability.mentor.id, name: b.availability.mentor.name, specialty: b.availability.mentor.specialty },
          organization: b.organization ?? null,
          viaOrganization: true,
          hostedByMe: false,
        });
      }
      bookings.sort((a: any, b: any) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime());
    }
    
    return NextResponse.json(bookings);
  } catch (error) {
    console.error('Error fetching mentor bookings:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء جلب الحجوزات.' },
      { status: 500 }
    );
  }
}
