import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

// Helper to check admin auth
async function isAdmin(request: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string, role: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Admins only
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 403 });
  }

  try {
    // Get all bookings, join mentor, participant, availability
    const bookings = await prisma.mentorBooking.findMany({
      include: {
        participant: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            secondName: true,
            familyName: true,
            email: true,
            phoneNumber: true,
          },
        },
        availability: {
          include: {
            mentor: {
              select: {
                id: true,
                name: true,
                email: true,
                specialty: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format response
    const result = bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      meetingUrl: booking.meetingUrl ?? null,
      mentor: {
        id: booking.availability.mentor.id,
        name: booking.availability.mentor.name,
        email: booking.availability.mentor.email,
        specialty: booking.availability.mentor.specialty,
      },
      participant: {
        id: booking.participant.id,
        name: booking.participant.fullName || [booking.participant.firstName, booking.participant.secondName, booking.participant.familyName].filter(Boolean).join(' ').trim() || booking.participant.email,
        email: booking.participant.email,
        phoneNumber: booking.participant.phoneNumber,
      },
      availability: {
        id: booking.availability.id,
        startTime: booking.availability.startTime,
        endTime: booking.availability.endTime,
      },
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching all mentor bookings:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب الحجوزات.' }, { status: 500 });
  }
}
