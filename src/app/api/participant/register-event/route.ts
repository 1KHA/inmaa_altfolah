import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { dispatchNotification } from '@/lib/notify';
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

// POST /api/participant/register-event - Register for an event
export async function POST(request: NextRequest) {
  try {
    // Get the current participant
    const participant = await getCurrentParticipant(request);
    
    if (!participant) {
      return NextResponse.json(
        { message: 'يجب تسجيل الدخول كمشارك للتسجيل في الفعالية' },
        { status: 401 }
      );
    }

    // Get the event ID from the request body
    const { eventId } = await request.json();
    
    if (!eventId) {
      return NextResponse.json(
        { message: 'معرف الفعالية مطلوب' },
        { status: 400 }
      );
    }

    // Check if the event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        registrations: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: 'الفعالية غير موجودة' },
        { status: 404 }
      );
    }

    // Check if the event is upcoming or active
    if (event.status !== 'upcoming' && event.status !== 'active') {
      return NextResponse.json(
        { message: 'لا يمكن التسجيل في فعالية منتهية أو ملغاة' },
        { status: 400 }
      );
    }

    // Check if the event is in the past
    if (new Date(event.startDate) < new Date()) {
      return NextResponse.json(
        { message: 'لا يمكن التسجيل في فعالية بدأت بالفعل' },
        { status: 400 }
      );
    }

    // Check if the event has reached capacity
    if (event.registrations.length >= event.capacity) {
      return NextResponse.json(
        { message: 'الفعالية ممتلئة، لا يمكن التسجيل' },
        { status: 400 }
      );
    }

    // Check if the participant is already registered for this event
    const existingRegistration = await prisma.eventRegistration.findFirst({
      where: {
        participantId: participant.id,
        eventId: eventId,
      },
    });

    if (existingRegistration) {
      return NextResponse.json(
        { message: 'أنت مسجل بالفعل في هذه الفعالية' },
        { status: 400 }
      );
    }

    // Create the registration
    const registration = await prisma.eventRegistration.create({
      data: {
        participantId: participant.id,
        eventId: eventId,
        status: 'registered',
      },
      include: {
        event: true,
      },
    });

    // Create notifications after successful registration
    try {
      // Notify participant with confirmation
      await dispatchNotification({
        templateKey: 'eventRegistrationConfirmation',
        variables: { eventTitle: event.title },
        audience: { kind: 'participant', id: participant.id },
        relatedEntityType: 'event',
        relatedEntityId: eventId,
      });

      // Notify admins about new registration
      const participantName = participant.fullName || [participant.firstName, participant.secondName, participant.familyName].filter(Boolean).join(' ').trim() || participant.email;
      await dispatchNotification({
        templateKey: 'newEventRegistration',
        variables: { participantName, eventTitle: event.title },
        audience: { kind: 'admins' },
        relatedEntityType: 'event',
        relatedEntityId: eventId,
      });

      // Check if event is approaching capacity (80% full) and warn admins
      const currentRegistrations = event.registrations.length + 1; // +1 for the new registration
      const capacityPercentage = (currentRegistrations / event.capacity) * 100;
      
      if (capacityPercentage >= 80) {
        await dispatchNotification({
          templateKey: 'eventCapacityWarning',
          variables: { eventTitle: event.title },
          audience: { kind: 'admins' },
          relatedEntityType: 'event',
          relatedEntityId: eventId,
        });
      }
    } catch (notificationError) {
      console.error('Error creating event registration notifications:', notificationError);
      // Don't fail the registration if notification fails
    }

    return NextResponse.json({
      message: 'تم التسجيل في الفعالية بنجاح',
      registration: {
        id: registration.id,
        status: registration.status,
        eventTitle: registration.event.title,
        eventDate: registration.event.startDate,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error registering for event:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التسجيل في الفعالية' },
      { status: 500 }
    );
  }
}

// GET /api/participant/register-event?eventId=xxx - Check if a participant is registered for an event
export async function GET(request: NextRequest) {
  try {
    // Get the current participant
    const participant = await getCurrentParticipant(request);
    
    if (!participant) {
      return NextResponse.json(
        { message: 'يجب تسجيل الدخول كمشارك للتحقق من التسجيل' },
        { status: 401 }
      );
    }

    // Get the event ID from the query parameters
    const eventId = request.nextUrl.searchParams.get('eventId');
    
    if (!eventId) {
      return NextResponse.json(
        { message: 'معرف الفعالية مطلوب' },
        { status: 400 }
      );
    }

    // Check if the registration exists
    const registration = await prisma.eventRegistration.findFirst({
      where: {
        participantId: participant.id,
        eventId: eventId,
      },
      include: {
        event: true,
      },
    });

    if (!registration) {
      return NextResponse.json({ isRegistered: false });
    }

    return NextResponse.json({
      isRegistered: true,
      registration: {
        id: registration.id,
        status: registration.status,
        eventTitle: registration.event.title,
        eventDate: registration.event.startDate,
        registeredAt: registration.createdAt,
      },
    });
  } catch (error) {
    console.error('Error checking registration:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء التحقق من التسجيل' },
      { status: 500 }
    );
  }
}

// DELETE /api/participant/register-event - Cancel registration for an event
export async function DELETE(request: NextRequest) {
  try {
    // Get the current participant
    const participant = await getCurrentParticipant(request);
    
    if (!participant) {
      return NextResponse.json(
        { message: 'يجب تسجيل الدخول كمشارك لإلغاء التسجيل' },
        { status: 401 }
      );
    }

    // Get the event ID from the request body
    const { eventId } = await request.json();
    
    if (!eventId) {
      return NextResponse.json(
        { message: 'معرف الفعالية مطلوب' },
        { status: 400 }
      );
    }

    // Check if the registration exists
    const registration = await prisma.eventRegistration.findFirst({
      where: {
        participantId: participant.id,
        eventId: eventId,
      },
      include: {
        event: true,
      },
    });

    if (!registration) {
      return NextResponse.json(
        { message: 'أنت غير مسجل في هذه الفعالية' },
        { status: 404 }
      );
    }

    // Check if the event has already started
    if (new Date(registration.event.startDate) < new Date()) {
      return NextResponse.json(
        { message: 'لا يمكن إلغاء التسجيل في فعالية بدأت بالفعل' },
        { status: 400 }
      );
    }

    // Delete the registration
    await prisma.eventRegistration.delete({
      where: {
        id: registration.id,
      },
    });

    return NextResponse.json({
      message: 'تم إلغاء التسجيل بنجاح',
    });
  } catch (error) {
    console.error('Error cancelling registration:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء إلغاء التسجيل' },
      { status: 500 }
    );
  }
}
