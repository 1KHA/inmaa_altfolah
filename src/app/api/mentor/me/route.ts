import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { requireActiveMentor } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface DecodedToken {
  id: string;
  role: string;
  iat: number;
  exp: number;
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 /api/mentor/me - Starting request');
    console.log('🌐 Request URL:', request.url);
    console.log('🔗 Request headers:', Object.fromEntries(request.headers.entries()));

    // Get all cookies for debugging
    const allCookies = request.cookies.getAll();
    console.log('🍪 All cookies received:', allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })));

    // Get the token from the cookies (using consistent 'token' name)
    const token = request.cookies.get('token')?.value;

    console.log(`🍪 Token cookie: ${token ? 'Present (' + token.length + ' chars)' : 'Missing'}`);

    if (!token) {
      console.log('❌ No token found in cookies');
      return NextResponse.json({ message: 'Authentication token not found' }, { status: 401 });
    }

    console.log('🔑 Attempting JWT verification...');
    console.log(`🔐 JWT_SECRET exists: ${!!JWT_SECRET}`);
    console.log(`🔐 JWT_SECRET length: ${JWT_SECRET.length}`);

    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    console.log('✅ JWT verified successfully');
    console.log('🔑 Decoded token:', {
      id: decoded.id,
      role: decoded.role,
      exp: decoded.exp,
      iat: decoded.iat
    });

    if (!decoded || decoded.role !== 'mentor') {
      console.log(`❌ Invalid role: ${decoded.role} (expected: mentor)`);
      return NextResponse.json({ message: 'Invalid token or role' }, { status: 403 });
    }
    // A disabled mentor must not keep a live dashboard session — this is the
    // endpoint MentorRouteGuard polls, so 403 bounces them to /login.
    const blocked_ = await requireActiveMentor(decoded.id);
    if (blocked_) return blocked_;


    const mentor = await prisma.mentor.findUnique({
      where: { id: decoded.id },
    });

    if (!mentor) {
      console.log(`❌ Mentor not found in database: ${decoded.id}`);
      return NextResponse.json({ message: 'Mentor not found' }, { status: 404 });
    }

    console.log('✅ Mentor found:', {
      id: mentor.id,
      name: mentor.name,
      email: mentor.email
    });

    // Return the mentor user data in standardized format (matching admin endpoint)
    return NextResponse.json({
      success: true,
      id: mentor.id,
      username: mentor.email, // Use email as username for compatibility
      email: mentor.email,
      name: mentor.name,
      role: 'mentor',
      specialty: mentor.specialty, // Use actual field from schema
      phone: mentor.phone,
      status: mentor.status,
    });
  } catch (error) {
    console.error('❌ Failed to get mentor profile:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
