import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { requireActiveParticipant } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    // Get join requests for the team using raw SQL
    const joinRequests = await prisma.$queryRaw`
      SELECT 
        tjr.id,
        tjr.status,
        tjr.message,
        tjr."createdAt",
        tjr."updatedAt",
        p.id as "participantId",
        p."fullName",
        p."firstName",
        p."secondName",
        p."familyName",
        p.email,
        p.university,
        p."professionalField"
      FROM "TeamJoinRequest" tjr
      JOIN "Participant" p ON tjr."participantId" = p.id
      WHERE tjr."teamId" = ${currentParticipant.teamId} AND tjr.status = 'pending'
      ORDER BY tjr."createdAt" DESC
    ` as any[];

    // Format the response
    const formattedRequests = joinRequests.map((req: any) => ({
      id: req.id,
      status: req.status,
      message: req.message,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      participant: {
        id: req.participantId,
        fullName: req.fullName,
        firstName: req.firstName,
        secondName: req.secondName,
        familyName: req.familyName,
        email: req.email,
        university: req.university,
        professionalField: req.professionalField,
        displayName: req.fullName || [req.firstName, req.secondName, req.familyName].filter(Boolean).join(' ').trim() || req.email
      }
    }));

    return NextResponse.json({ requests: formattedRequests });

  } catch (error) {
    console.error('Error fetching team join requests:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في جلب طلبات الانضمام' },
      { status: 500 }
    );
  }
}
