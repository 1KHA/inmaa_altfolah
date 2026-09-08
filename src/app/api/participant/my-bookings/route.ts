import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    // Get the current participant
    const participant = await getCurrentParticipant(request);
    
    if (!participant) {
      return NextResponse.json(
        { message: 'يجب تسجيل الدخول كمشارك لعرض المواعيد المحجوزة' },
        { status: 401 }
      );
    }

    // Fetch all bookings for the participant
    const bookings = await (prisma as any).mentorBooking.findMany({
      where: {
        participantId: participant.id,
        status: 'booked', // Only get active bookings
      },
      include: {
        availability: {
          include: {
            mentor: true,
          },
        },
      },
      orderBy: {
        availability: {
          startTime: 'asc', // Order by start time ascending (earliest first)
        },
      },
    });

    // Format the response
    const formattedBookings = bookings.map((booking: any) => ({
      id: booking.id,
      mentorName: booking.availability.mentor.name,
      mentorSpecialty: booking.availability.mentor.specialty,
      startTime: booking.availability.startTime,
      endTime: booking.availability.endTime,
      status: booking.status,
      meetingUrl: booking.meetingUrl ?? null,
      createdAt: booking.createdAt,
    }));

    return NextResponse.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching participant bookings:', error);
    return NextResponse.json(
      { message: 'حدث خطأ أثناء جلب المواعيد المحجوزة' },
      { status: 500 }
    );
  }
}
