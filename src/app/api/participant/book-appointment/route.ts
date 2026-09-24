import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { dispatchNotification } from '@/lib/notify';
import { generateMeetingUrl, getMeetingJoinUrl } from '@/lib/meeting';
import { getBookingMode, BOOKABLE_MENTOR_WHERE, organizationBusyAt } from '@/lib/organizations';
import { formatRiyadhDateTime } from '@/lib/format-dates';
import { getBookingLimit, countBookingsWithMentor, countBookingsWithOrganization, limitMessage } from '@/lib/booking-limits';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface JwtPayload {
  participantId: string;
  email: string;
  role: string;
  teamId?: string;
  isLeader?: boolean;
}

// Helper function to get the current participant from the session
async function getCurrentParticipant(request: NextRequest) {
  const cookieStore = cookies();
  const tokenCookie = cookieStore.get('token');
  
  if (!tokenCookie) {
    return null;
  }

  try {
    const token = tokenCookie.value;
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    console.log('Decoded token:', decoded);
    
    // Extract participantId directly from the token
    const participantId = decoded.participantId;
    
    if (!participantId) {
      console.error('No participantId found in token:', decoded);
      return null;
    }
    
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { phase: { select: { isDisabled: true } }, team: { select: { isDisabled: true, phase: { select: { isDisabled: true } } } } },
    });

    // Disabled accounts resolve to null, so every method in this file
    // (POST/GET/DELETE) rejects them exactly like an unauthenticated request.
    if (isEffectivelyDisabled(participant)) return null;

    return participant;
  } catch (error) {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the current participant
    const participant = await getCurrentParticipant(request);
    
    if (!participant) {
      return NextResponse.json(
        { message: 'يجب تسجيل الدخول كمشارك لحجز موعد' },
        { status: 401 }
      );
    }

    // Get the availability ID (and, for an organization booking, the org) from the body
    const { availabilityId, organizationId: rawOrganizationId } = await request.json();
    const organizationId: string | null = rawOrganizationId ? String(rawOrganizationId) : null;
    
    if (!availabilityId) {
      return NextResponse.json(
        { message: 'معرف الموعد مطلوب' },
        { status: 400 }
      );
    }

    // Check if the availability exists
    const availability = await prisma.mentorAvailability.findUnique({
      where: { id: availabilityId },
      include: {
        mentor: true,
        bookings: true,
      },
    });

    if (!availability) {
      return NextResponse.json(
        { message: 'الموعد غير موجود' },
        { status: 404 }
      );
    }

    // A disabled mentor is not bookable, regardless of their status field.
    if (availability.mentor.isDisabled) {
      return NextResponse.json(
        { error: 'هذا الموجه غير متاح حالياً' },
        { status: 403 }
      );
    }

    // Check if the mentor is active
    if (availability.mentor.status !== 'active') {
      return NextResponse.json(
        { message: 'الموجه غير نشط حالياً' },
        { status: 400 }
      );
    }

    // Check if the availability is already booked
    if (availability.bookings.length > 0) {
      return NextResponse.json(
        { message: 'هذا الموعد محجوز بالفعل' },
        { status: 400 }
      );
    }

    // Check if the availability is in the past
    if (new Date(availability.startTime) < new Date()) {
      return NextResponse.json(
        { message: 'لا يمكن حجز موعد في الماضي' },
        { status: 400 }
      );
    }

    // ---- booking mode (admin setting): individual | organization | both ----
    const mode = await getBookingMode();
    // Per-participant limit with the same mentor/organization (admin setting)
    const limit = await getBookingLimit();
    let organization: { id: string; name: string } | null = null;

    if (organizationId) {
      if (mode === 'individual') {
        return NextResponse.json({ message: 'الحجز عبر الجهات غير متاح حالياً.' }, { status: 403 });
      }
      organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true },
      });
      if (!organization) {
        return NextResponse.json({ message: 'الجهة غير موجودة.' }, { status: 404 });
      }
      // The slot must belong to a member of that organization
      if (availability.mentor.organizationId !== organization.id) {
        return NextResponse.json({ message: 'هذا الموعد لا يتبع الجهة المختارة.' }, { status: 400 });
      }
      // At most N non-cancelled bookings per ORGANIZATION per participant
      // (see src/lib/booking-limits.ts — cancelled ones and bookings before
      // the admin's reset mark don't count).
      const orgCount = await countBookingsWithOrganization(participant.id, organization.id, limit.resetAt);
      if (orgCount >= limit.max) {
        return NextResponse.json({ message: limitMessage('organization', limit.max), limit: limit.max, used: orgCount }, { status: 400 });
      }
      // All members join an organization session, so the organization is
      // busy whenever ANY member already has a session in this window — even
      // if this particular member's slot is still free.
      if (await organizationBusyAt(organization.id, { startTime: availability.startTime, endTime: availability.endTime })) {
        return NextResponse.json({ message: 'الجهة محجوزة في هذا الوقت، اختر وقتاً آخر.' }, { status: 400 });
      }
    } else {
      if (mode === 'organization') {
        return NextResponse.json({ message: 'الحجز متاح عبر الجهات فقط، اختر جهة للحجز معها.' }, { status: 403 });
      }
      // At most N non-cancelled bookings per mentor per participant (admin
      // setting; cancelled bookings and bookings before the reset mark don't count).
      const mentorCount = await countBookingsWithMentor(participant.id, availability.mentorId, limit.resetAt);
      if (mentorCount >= limit.max) {
        return NextResponse.json({ message: limitMessage('mentor', limit.max), limit: limit.max, used: mentorCount }, { status: 400 });
      }
    }

    // Create the booking with its own auto-generated video-meeting room
    const booking = await prisma.mentorBooking.create({
      data: {
        participantId: participant.id,
        availabilityId: availabilityId,
        status: 'booked',
        meetingUrl: generateMeetingUrl(),
        organizationId: organization?.id ?? null,
      },
      include: {
        availability: {
          include: {
            mentor: true,
          },
        },
      },
    });

    // Create notifications for the booking
    try {
      const participantName = participant.fullName || [participant.firstName, participant.secondName, participant.familyName].filter(Boolean).join(' ').trim() || participant.email;
      const dateTime = formatRiyadhDateTime(booking.availability.startTime);

      // Tracked platform link: records who opened the meeting (Meeting_Trigger.md).
      const meetingLink = booking.meetingUrl ? getMeetingJoinUrl(booking.id) : '';
      const bookerAudience = participant.teamId
        ? ({ kind: 'team', teamId: participant.teamId } as const)
        : ({ kind: 'participant', id: participant.id } as const);

      if (organization) {
        // Organization booking: EVERY active member of the organization gets
        // the request + meeting link, not just the owner of the slot.
        const members = await prisma.mentor.findMany({
          where: { organizationId: organization.id, ...BOOKABLE_MENTOR_WHERE },
          select: { id: true },
        });
        for (const m of members) {
          await dispatchNotification({
            templateKey: 'orgBookingRequest',
            variables: { participantName, dateTime, meetingLink, organizationName: organization.name },
            audience: { kind: 'mentor', id: m.id },
            relatedEntityType: 'booking',
            relatedEntityId: booking.id,
          });
        }
        await dispatchNotification({
          templateKey: 'orgBookingConfirmation',
          variables: { organizationName: organization.name, dateTime, meetingLink },
          audience: bookerAudience,
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
        });
      } else {
        // Notify the mentor about the new booking request (with the room link)
        await dispatchNotification({
          templateKey: 'newBookingRequest',
          variables: { participantName, dateTime, meetingLink },
          audience: { kind: 'mentor', id: booking.availability.mentor.id },
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
        });

        // Booking confirmation with the meeting link. When the booker belongs
        // to a team the WHOLE team gets it — teammates attend the session too;
        // an individual booker gets it directly.
        await dispatchNotification({
          templateKey: 'bookingConfirmation',
          variables: { mentorName: booking.availability.mentor.name, dateTime, meetingLink },
          audience: bookerAudience,
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
        });
      }
    } catch (notificationError) {
      console.error('Error creating booking notifications:', notificationError);
      // Don't fail the booking if notification fails
    }

    return NextResponse.json({
      message: 'تم حجز الموعد بنجاح',
      booking: {
        id: booking.id,
        status: booking.status,
        mentorName: booking.availability.mentor.name,
        meetingUrl: booking.meetingUrl,
        organization,
        startTime: booking.availability.startTime,
        endTime: booking.availability.endTime,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error booking appointment:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء حجز الموعد' },
      { status: 500 }
    );
  }
}

// Check if a booking exists for a specific availability
export async function GET(request: NextRequest) {
  try {
    // Get the current participant
    const participant = await getCurrentParticipant(request);
    
    if (!participant) {
      return NextResponse.json(
        { message: 'يجب تسجيل الدخول كمشارك للتحقق من الحجز' },
        { status: 401 }
      );
    }

    // Get the availability ID from the query parameters
    const availabilityId = request.nextUrl.searchParams.get('availabilityId');
    
    if (!availabilityId) {
      return NextResponse.json(
        { message: 'معرف الموعد مطلوب' },
        { status: 400 }
      );
    }

    // Check if the booking exists
    const booking = await prisma.mentorBooking.findFirst({
      where: {
        availabilityId: availabilityId,
      },
      include: {
        availability: {
          include: {
            mentor: true,
          },
        },
        participant: true,
      },
    });

    if (!booking) {
      return NextResponse.json({ isBooked: false });
    }

    // Check if the booking belongs to the current participant
    const isOwnBooking = booking.participantId === participant.id;

    return NextResponse.json({
      isBooked: true,
      isOwnBooking,
      booking: isOwnBooking ? {
        id: booking.id,
        status: booking.status,
        mentorName: booking.availability.mentor.name,
        meetingUrl: booking.meetingUrl ?? null,
        startTime: booking.availability.startTime,
        endTime: booking.availability.endTime,
      } : null,
    });
  } catch (error) {
    console.error('Error checking booking:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التحقق من الحجز' },
      { status: 500 }
    );
  }
}
