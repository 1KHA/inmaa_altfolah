import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PARTICIPANT_PUBLIC_FIELDS } from '@/lib/participant-fields';
import jwt from 'jsonwebtoken';
import { requireActiveParticipant } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Get JWT token from cookies
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { participantId: string };

    // Disabled accounts cannot act (see src/lib/account-status.ts)
    const blocked_ = await requireActiveParticipant(decoded.participantId);
    if (blocked_) return blocked_;

    
    // Get request body
    const updateData = await request.json();

    // Remove fields that shouldn't be updated by participants
    const {
      id,
      passwordHash,
      status,
      teamId,
      isLeader,
      createdAt,
      updatedAt,
      team,
      role, // Remove role field as it doesn't exist in the Participant model
      ...allowedUpdates
    } = updateData;

    // Update participant
    const updatedParticipant = await prisma.participant.update({
      where: { id: decoded.participantId },
      data: {
        ...allowedUpdates,
        updatedAt: new Date()
      },
      select: PARTICIPANT_PUBLIC_FIELDS
    });

    return NextResponse.json({
      message: 'تم تحديث الملف الشخصي بنجاح',
      participant: updatedParticipant
    });

  } catch (error) {
    console.error('Error updating participant profile:', error);
    return NextResponse.json(
      { error: 'فشل في تحديث الملف الشخصي' },
      { status: 500 }
    );
  }
}
