import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { requireActiveParticipant, isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 /api/participant/me - Starting request');
    console.log('🌐 Request URL:', request.url);
    console.log('🔗 Request headers:', Object.fromEntries(request.headers.entries()));
    
    // Debug all cookies
    const allCookies = request.cookies.getAll();
    console.log('🍪 All cookies received:', allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })));
    
    // Get JWT token from cookies (consistent with other endpoints)
    const token = request.cookies.get('token')?.value;
    console.log('🍪 Token cookie:', token ? `Present (${token.length} chars)` : 'Missing');
    
    if (!token) {
      console.error('❌ No token found in cookies');
      console.log('🔍 Available cookie names:', allCookies.map(c => c.name));
      return NextResponse.json({ error: 'غير مصرح - لا يوجد token' }, { status: 401 });
    }

    // Verify JWT token (consistent with other endpoints)
    let decoded;
    try {
      console.log('🔑 Attempting JWT verification...');
      console.log('🔐 JWT_SECRET exists:', !!process.env.JWT_SECRET);
      console.log('🔐 JWT_SECRET length:', process.env.JWT_SECRET?.length || 0);
      
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      console.log('✅ JWT verified successfully');
      console.log('🔑 Decoded token:', { 
        participantId: decoded.participantId, 
        email: decoded.email, 
        role: decoded.role,
        exp: decoded.exp,
        iat: decoded.iat
      });
    } catch (jwtError) {
      console.error('❌ JWT verification failed:', jwtError);
      console.log('🔍 Token preview:', token.substring(0, 50) + '...');
      return NextResponse.json({ error: 'غير مصرح - token غير صالح' }, { status: 401 });
    }

    if (!decoded.participantId) {
      console.error('No participantId in token:', decoded);
      return NextResponse.json({ error: 'غير مصرح - participantId مفقود من الـ token' }, { status: 401 });
    }
    // A disabled account must not keep a live dashboard session: this is the
    // endpoint ParticipantRouteGuard polls, so 403 here bounces them to /login.
    const blocked_ = await requireActiveParticipant(decoded.participantId);
    if (blocked_) return blocked_;

    
    const participant = await prisma.participant.findUnique({
      where: { id: decoded.participantId },
      include: {
        team: {
          select: {
            id: true,
            teamName: true,
            status: true
          }
        }
      }
    });

    if (!participant) {
      console.error('❌ Participant not found with ID:', decoded.participantId);
      return NextResponse.json({ error: 'المشارك غير موجود في قاعدة البيانات' }, { status: 404 });
    }

    console.log('✅ Participant found:', { 
      id: participant.id, 
      email: participant.email, 
      fullName: participant.fullName 
    });
    console.log('📊 Team info:', participant.team ? { id: participant.team.id, name: participant.team.teamName, status: participant.team.status } : 'No team');

    // Handle different data formats and provide fallbacks
    const safeParticipant = {
      id: participant.id,
      email: participant.email || '',
      // Explicitly add role field to ensure it's always present
      role: 'participant',
      status: (participant as any).status || 'pending',
      teamId: participant.teamId,
      isLeader: participant.isLeader || false,
      // passwordHash deliberately NOT included — no client reads it, and it
      // was previously shipped to the browser on every dashboard load
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
      
      // Handle name fields with fallbacks
      firstName: participant.firstName || '',
      secondName: participant.secondName || '',
      familyName: participant.familyName || '',
      fullName: participant.fullName || 
                `${participant.firstName || ''} ${participant.secondName || ''} ${participant.familyName || ''}`.trim() || 
                'غير متوفر',
      
      // Handle contact information
      phoneNumber: participant.phoneNumber || participant.contactNumber || '',
      contactNumber: participant.contactNumber || participant.phoneNumber || '',
      
      // Handle personal information
      nationalId: participant.nationalId || '',
      dob: participant.dob || '',
      gender: participant.gender || '',
      nationality: participant.nationality || '',
      residence: participant.residence || participant.city || '',
      city: participant.city || participant.residence || '',
      
      // Handle education information
      education: participant.education || '',
      university: participant.university || '',
      major: participant.major || participant.universityMajor || '',
      universityMajor: participant.universityMajor || participant.major || '',
      employmentStatus: participant.employmentStatus || participant.professionalField || '',
      professionalField: participant.professionalField || participant.employmentStatus || '',
      
      // Handle boolean fields
      canAttend: participant.canAttend !== null ? participant.canAttend : 
                 (participant.canAttendHackathon !== null ? participant.canAttendHackathon : true),
      canAttendHackathon: participant.canAttendHackathon !== null ? participant.canAttendHackathon : 
                          (participant.canAttend !== null ? participant.canAttend : true),
      isUniversityStudent: participant.isUniversityStudent !== null ? participant.isUniversityStudent : null,
      
      // Team information
      team: participant.team
    };

    return NextResponse.json(safeParticipant);

  } catch (error) {
    console.error('Error fetching participant details:', error);
    return NextResponse.json({ error: 'فشل في جلب بيانات المشارك' }, { status: 500 });
  }
}
