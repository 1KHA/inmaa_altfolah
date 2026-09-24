import { NextRequest, NextResponse } from 'next/server'
import { isSecureRequest } from '@/lib/cookie-security';
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'اسم المستخدم وكلمة المرور مطلوبان' },
        { status: 400 }
      )
    }

    // Find admin by username
    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin) {
      return NextResponse.json(
        { error: 'بيانات الاعتماد غير صالحة' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'بيانات الاعتماد غير صالحة' },
        { status: 401 }
      );
    }

    console.log(`✅ Admin login successful for ${username}`);

    // Generate JWT token for admin (30 minutes expiration for security)
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: 'admin',
      },
      JWT_SECRET,
      { expiresIn: '60m' }
    );

    console.log(`🔑 JWT token created for admin ${username}`);
    console.log(`   - Token length: ${token.length}`);
    console.log(`   - Admin ID: ${admin.id}`);

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        username: admin.username,
        role: 'admin',
      },
    });

    // Use consistent cookie name 'token' with 30-minute expiration
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      maxAge: 60 * 60, // 60 minutes (matches JWT expiration)
      path: '/', // Ensure cookie is available for all paths
      domain: process.env.NODE_ENV === 'production' ? undefined : undefined, // Let browser handle domain
    });

    console.log(`🍪 Admin cookie set with settings:`, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      maxAge: 60 * 60, // 60 minutes
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Error during admin login:', error)
    return NextResponse.json(
      { error: 'فشل تسجيل الدخول' },
      { status: 500 }
    )
  }
}
