import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { dispatchNotification } from '@/lib/notify';
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
    const { teamId, message } = await request.json();

    if (!teamId) {
      return NextResponse.json({ error: 'معرف الفريق مطلوب' }, { status: 400 });
    }

    // Get current participant to check eligibility
    const currentParticipant = await prisma.participant.findUnique({
      where: { id: decoded.participantId },
      select: { 
        id: true,
        teamId: true,
        fullName: true,
        firstName: true,
        secondName: true,
        familyName: true
      }
    });

    if (!currentParticipant) {
      return NextResponse.json({ error: 'المشارك غير موجود' }, { status: 404 });
    }

    // Check if participant already has a team
    if (currentParticipant.teamId) {
      return NextResponse.json({ error: 'أنت عضو في فريق بالفعل' }, { status: 403 });
    }

    // Check if participant has reached the limit of 5 pending requests
    // For now, we'll use a direct query since the relation might not be available yet
    const pendingRequestsCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "TeamJoinRequest" 
      WHERE "participantId" = ${decoded.participantId} AND status = 'pending'
    ` as any[];
    
    const pendingCount = parseInt(pendingRequestsCount[0]?.count || '0');
    if (pendingCount >= 5) {
      return NextResponse.json({ 
        error: 'لا يمكنك إرسال أكثر من 5 طلبات انضمام في نفس الوقت' 
      }, { status: 403 });
    }

    // Check if team exists and is approved
    const targetTeam = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        participants: {
          select: { id: true, isLeader: true }
        }
      }
    });

    if (!targetTeam) {
      return NextResponse.json({ error: 'الفريق غير موجود' }, { status: 404 });
    }

    if (targetTeam.status !== 'approved') {
      return NextResponse.json({ error: 'الفريق غير مقبول' }, { status: 403 });
    }

    // Check if team has space (less than 5 members)
    if (targetTeam.participants.length >= 5) {
      return NextResponse.json({ error: 'الفريق مكتمل العدد' }, { status: 403 });
    }

    // Check if request already exists using raw SQL
    const existingRequestResult = await prisma.$queryRaw`
      SELECT id FROM "TeamJoinRequest" 
      WHERE "participantId" = ${decoded.participantId} AND "teamId" = ${teamId}
    ` as any[];

    if (existingRequestResult.length > 0) {
      return NextResponse.json({ 
        error: 'لقد أرسلت طلب انضمام لهذا الفريق من قبل' 
      }, { status: 409 });
    }

    // Create the join request using raw SQL
    const joinRequestResult = await prisma.$queryRaw`
      INSERT INTO "TeamJoinRequest" ("id", "participantId", "teamId", "message", "status", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${decoded.participantId}, ${teamId}, ${message || null}, 'pending', NOW(), NOW())
      RETURNING id
    ` as any[];

    const joinRequest = { id: joinRequestResult[0]?.id };

    // Find team leader to send notification
    const teamLeader = targetTeam.participants.find(p => p.isLeader);
    
    if (teamLeader) {
      const participantName = currentParticipant.fullName || 
        (currentParticipant.fullName || [currentParticipant.firstName, currentParticipant.secondName, currentParticipant.familyName].filter(Boolean).join(' ').trim());
      
      // Send notification to team leader
      await dispatchNotification({
        templateKey: 'teamJoinRequest',
        variables: { participantName, teamName: targetTeam.teamName || '' },
        audience: { kind: 'participant', id: teamLeader.id },
        relatedEntityType: 'team',
        relatedEntityId: teamId,
      });
    }

    return NextResponse.json({ 
      message: 'تم إرسال طلب الانضمام بنجاح',
      requestId: joinRequest.id 
    });

  } catch (error) {
    console.error('Error creating join request:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في إرسال طلب الانضمام' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get JWT token from cookies
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { participantId: string };
    
    // Get participant's sent join requests using raw SQL
    const joinRequests = await prisma.$queryRaw`
      SELECT 
        tjr.id,
        tjr.status,
        tjr.message,
        tjr."createdAt",
        tjr."updatedAt",
        t.id as "teamId",
        t."teamName",
        t."ideaDescription"
      FROM "TeamJoinRequest" tjr
      JOIN "Team" t ON tjr."teamId" = t.id
      WHERE tjr."participantId" = ${decoded.participantId}
      ORDER BY tjr."createdAt" DESC
    ` as any[];

    // Format the response to match expected structure
    const formattedRequests = joinRequests.map((req: any) => ({
      id: req.id,
      status: req.status,
      message: req.message,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      team: {
        id: req.teamId,
        teamName: req.teamName,
        ideaDescription: req.ideaDescription
      }
    }));

    return NextResponse.json({ requests: formattedRequests });

  } catch (error) {
    console.error('Error fetching join requests:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في جلب طلبات الانضمام' },
      { status: 500 }
    );
  }
}
