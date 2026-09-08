import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { isEffectivelyDisabled, DISABLED_ACCOUNT_MESSAGE } from '@/lib/account-status'
import jwt from 'jsonwebtoken'

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    console.log(`🔐 Login attempt for email: ${email}`);

    if (!email || !password) {
      console.log(`❌ Missing email or password`);
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Try to find a participant first
    const participant = await prisma.participant.findUnique({
      where: { email },
      include: {
        // team.phase is needed by isEffectivelyDisabled — a member of a team in
        // a disabled PHASE must not be able to log in either.
        team: { include: { phase: { select: { isDisabled: true } } } },
        phase: { select: { isDisabled: true } },
      },
    });

    if (participant) {
      console.log(`👤 Participant found: ${participant.email}`);
      console.log(`   - Has password hash: ${participant.passwordHash ? 'YES' : 'NO'}`);
      console.log(`   - Team ID: ${participant.teamId || 'None (Individual)'}`);
      console.log(`   - Team status: ${participant.team?.status || 'N/A'}`);
      console.log(`   - Participant status: ${(participant as any).status || 'N/A'}`);

      // Check if participant has a password (account is activated)
      if (!participant.passwordHash) {
        console.log(`❌ No password hash - account not activated`);
        return NextResponse.json(
          { error: 'Account not activated. Please wait for admin approval.' },
          { status: 401 }
        );
      }

      console.log(`🔑 Participant password check:`);
      console.log(`   - Provided password: "${password}"`);
      console.log(`   - Participant type: ${participant.teamId ? 'Team Member' : 'Individual'}`);
      
      // SECURITY FIX: Only check the provided password against the stored hash
      const isValidPassword = await bcrypt.compare(password, participant.passwordHash);
      
      console.log(`🔑 Password verification: ${isValidPassword ? 'VALID' : 'INVALID'}`);

      if (!isValidPassword) {
        console.log(`❌ Invalid password for ${email}`);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Disabled by an admin — checked AFTER the password so this cannot be
      // used to enumerate which emails exist. Covers both a directly disabled
      // participant and a member of a disabled team.
      if (isEffectivelyDisabled(participant)) {
        console.log(`\u274c Account disabled: ${email}`);
        return NextResponse.json(
          { error: DISABLED_ACCOUNT_MESSAGE },
          { status: 403 }
        );
      }

      // Check if participant has a team and if it's approved (only for team members)
      if (participant.teamId && (!participant.team || participant.team.status !== 'approved')) {
        console.log(`❌ Team not approved: ${participant.team?.status}`);
        return NextResponse.json(
          { error: 'Your team is not yet approved' },
          { status: 401 }
        )
      }

      // Generate JWT token for participant (30 minutes expiration)
      const token = jwt.sign(
        {
          id: participant.id,  // Primary identifier for consistency
          participantId: participant.id,  // Keep for backward compatibility
          email: participant.email,
          role: 'participant',
          teamId: participant.teamId || null,
          isLeader: participant.isLeader || false,
        },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      console.log(`✅ JWT token created successfully for ${email}`);
      console.log(`   - Token length: ${token.length}`);
      console.log(`   - Participant ID: ${participant.id}`);

      const fullName = participant.fullName || `${participant.firstName || ''} ${participant.secondName || ''} ${participant.familyName || ''}`.trim();

      const response = NextResponse.json({
        success: true,
        user: {
          id: participant.id,
          fullName: fullName,
          email: participant.email,
          teamId: participant.teamId,
          teamName: participant.team?.teamName || null,
          isLeader: participant.isLeader,
          role: 'participant',
        },
      });

      // Use consistent cookie name with 30-minute expiration
      response.cookies.set('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60, // 30 minutes (matches JWT expiration)
        path: '/', // Ensure cookie is available for all paths
        domain: process.env.NODE_ENV === 'production' ? undefined : undefined, // Let browser handle domain
      });

      console.log(`🍪 Cookie set with settings:`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60, // 30 minutes
        path: '/'
      });

      console.log(`✅ Login successful for ${email}`);
      return response;
    }

    // If not a participant, check if it's a mentor
    console.log(`🔍 Participant not found, checking for mentor: ${email}`);
    const mentor = await prisma.mentor.findUnique({
      where: { email },
    });

    if (!mentor || !mentor.passwordHash) {
      console.log(`❌ No mentor found or no password hash for ${email}`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, mentor.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Disabled by an admin — after the password check, same as participants.
    if (mentor.isDisabled) {
      console.log(`\u274c Mentor account disabled: ${email}`);
      return NextResponse.json({ error: DISABLED_ACCOUNT_MESSAGE }, { status: 403 });
    }

    // Generate JWT token for mentor
    const token = jwt.sign(
      {
        id: mentor.id,  // Primary identifier for consistency
        mentorId: mentor.id,  // Keep for backward compatibility
        email: mentor.email,
        role: 'mentor',
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: mentor.id,
        fullName: mentor.name,
        email: mentor.email,
        role: 'mentor',
      },
    });

    // Set HTTP-only cookie (consistent cookie name)
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/', // Ensure cookie is available for all paths
      domain: process.env.NODE_ENV === 'production' ? undefined : undefined, // Let browser handle domain
    })

    console.log(`🍪 Mentor cookie set with settings:`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    });

    return response
  } catch (error) {
    console.error('❌ Error during login:', error)
    return NextResponse.json(
      { error: 'Failed to login' },
      { status: 500 }
    )
  }
}
