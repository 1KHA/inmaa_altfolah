import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { dispatchNotification } from '@/lib/notify';
import bcrypt from 'bcryptjs';
import { generatePassword, credentialVariables } from '@/lib/credentials';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

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
    const { requestId, action } = await request.json();

    if (!requestId || !action) {
      return NextResponse.json({ error: 'معرف الطلب والإجراء مطلوبان' }, { status: 400 });
    }

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'إجراء غير صحيح' }, { status: 400 });
    }

    // Get current participant to check if they are a team leader
    const currentParticipant = await prisma.participant.findUnique({
      where: { id: decoded.participantId },
      select: { 
        id: true,
        teamId: true,
        isLeader: true
      }
    });

    if (!currentParticipant) {
      return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    }

    if (!currentParticipant.isLeader) {
      return NextResponse.json({ error: 'أنت لست قائد فريق' }, { status: 403 });
    }

    if (!currentParticipant.teamId) {
      return NextResponse.json({ error: 'أنت لست عضو في أي فريق' }, { status: 403 });
    }

    // Get the join request using raw SQL
    const joinRequestResult = await prisma.$queryRaw`
      SELECT 
        tjr.id,
        tjr."participantId",
        tjr."teamId",
        tjr.status,
        p."fullName",
        p."firstName",
        p."secondName",
        p."familyName",
        t."teamName"
      FROM "TeamJoinRequest" tjr
      JOIN "Participant" p ON tjr."participantId" = p.id
      JOIN "Team" t ON tjr."teamId" = t.id
      WHERE tjr.id = ${requestId} AND tjr."teamId" = ${currentParticipant.teamId}
    ` as any[];

    if (joinRequestResult.length === 0) {
      return NextResponse.json({ error: 'طلب الانضمام غير موجود' }, { status: 404 });
    }

    const joinRequest = joinRequestResult[0];

    if (joinRequest.status !== 'pending') {
      return NextResponse.json({ error: 'تم التعامل مع هذا الطلب من قبل' }, { status: 409 });
    }

    if (action === 'accept') {
      // Check if team still has space
      const teamMembersCount = await prisma.participant.count({
        where: { teamId: currentParticipant.teamId }
      });

      if (teamMembersCount >= 5) {
        return NextResponse.json({ error: 'الفريق مكتمل العدد' }, { status: 403 });
      }

      // Check if participant still doesn't have a team
      const participantToAdd = await prisma.participant.findUnique({
        where: { id: joinRequest.participantId },
        select: { teamId: true, isDisabled: true, phase: { select: { isDisabled: true } }, team: { select: { isDisabled: true, phase: { select: { isDisabled: true } } } } }
      });

      // The joining account itself must be active — a disabled participant
      // cannot be added to a team by anyone.
      if (isEffectivelyDisabled(participantToAdd)) {
        return NextResponse.json({ error: DISABLED_ACCOUNT_MESSAGE }, { status: 403 });
      }

      if (participantToAdd?.teamId) {
        // Update request status to rejected since participant already joined another team
        await prisma.$executeRaw`
          UPDATE "TeamJoinRequest" 
          SET status = 'rejected', "updatedAt" = NOW()
          WHERE id = ${requestId}
        `;
        
        return NextResponse.json({ 
          error: 'المشارك انضم لفريق آخر بالفعل' 
        }, { status: 409 });
      }

      // Accept the request: Add participant to team and update request status
      await prisma.$transaction(async (tx) => {
        // Add participant to team
        await tx.$executeRaw`
          UPDATE "Participant" 
          SET "teamId" = ${currentParticipant.teamId}, "updatedAt" = NOW()
          WHERE id = ${joinRequest.participantId}
        `;

        // Update request status to accepted
        await tx.$executeRaw`
          UPDATE "TeamJoinRequest" 
          SET status = 'accepted', "updatedAt" = NOW()
          WHERE id = ${requestId}
        `;

        // Reject all other pending requests from this participant
        await tx.$executeRaw`
          UPDATE "TeamJoinRequest" 
          SET status = 'rejected', "updatedAt" = NOW()
          WHERE "participantId" = ${joinRequest.participantId} 
          AND status = 'pending' 
          AND id != ${requestId}
        `;
      });

      // Send notification to the accepted participant
      const participantName = joinRequest.fullName || 
        [joinRequest.firstName, joinRequest.secondName, joinRequest.familyName].filter(Boolean).join(' ').trim();

      // A participant joining an approved team needs login credentials. If
      // they never had a password (registered as an individual, not yet
      // approved), issue one now and send it in their acceptance email.
      const joiner = await prisma.participant.findUnique({
        where: { id: joinRequest.participantId },
        select: { email: true, passwordHash: true },
      });
      let issuedPassword: string | null = null;
      if (joiner && !joiner.passwordHash) {
        issuedPassword = generatePassword();
        await prisma.participant.update({
          where: { id: joinRequest.participantId },
          data: { passwordHash: await bcrypt.hash(issuedPassword, 10) },
        });
      }

      await dispatchNotification({
        templateKey: 'joinRequestAccepted',
        variables: { teamName: joinRequest.teamName || '' },
        perRecipient: joiner
          ? {
              [joinRequest.participantId]: credentialVariables({
                email: joiner.email,
                password: issuedPassword,
                participantName,
              }),
            }
          : undefined,
        audience: { kind: 'participant', id: joinRequest.participantId },
        relatedEntityType: 'team',
        relatedEntityId: joinRequest.teamId,
      });

      return NextResponse.json({ 
        message: 'تم قبول طلب الانضمام بنجاح',
        action: 'accepted'
      });

    } else { // action === 'reject'
      // Update request status to rejected
      await prisma.$executeRaw`
        UPDATE "TeamJoinRequest" 
        SET status = 'rejected', "updatedAt" = NOW()
        WHERE id = ${requestId}
      `;

      // Send notification to the rejected participant
      await dispatchNotification({
        templateKey: 'joinRequestRejected',
        variables: { teamName: joinRequest.teamName || '' },
        audience: { kind: 'participant', id: joinRequest.participantId },
        relatedEntityType: 'team',
        relatedEntityId: joinRequest.teamId,
      });

      return NextResponse.json({ 
        message: 'تم رفض طلب الانضمام',
        action: 'rejected'
      });
    }

  } catch (error) {
    console.error('Error handling join request:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في معالجة طلب الانضمام' },
      { status: 500 }
    );
  }
}
