import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const dynamic = 'force-dynamic';

interface ResetClaims {
  purpose?: string;
  userType?: 'participant' | 'mentor' | 'advisor';
  id?: string;
}

/** Complete a password reset using a token issued by /api/forgot-password. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token) {
      return NextResponse.json({ error: 'رابط إعادة التعيين غير صالح' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        { status: 400 }
      );
    }

    let claims: ResetClaims;
    try {
      claims = jwt.verify(token, JWT_SECRET) as ResetClaims;
    } catch {
      return NextResponse.json(
        { error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.' },
        { status: 400 }
      );
    }

    // The purpose claim is what keeps ordinary login tokens unusable here
    if (claims.purpose !== 'password-reset' || !claims.id || !claims.userType) {
      return NextResponse.json({ error: 'رابط إعادة التعيين غير صالح' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (claims.userType === 'participant') {
      await prisma.participant.update({ where: { id: claims.id }, data: { passwordHash } });
    } else if (claims.userType === 'mentor') {
      await prisma.mentor.update({ where: { id: claims.id }, data: { passwordHash } });
    } else if (claims.userType === 'advisor') {
      await prisma.advisor.update({ where: { id: claims.id }, data: { passwordHash } });
    } else {
      return NextResponse.json({ error: 'رابط إعادة التعيين غير صالح' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.',
    });
  } catch (error) {
    // P2025 = record no longer exists (account deleted after token was issued)
    if ((error as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
    }
    console.error('Error in reset-password:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
