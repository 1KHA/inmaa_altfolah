import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { getEmailSettings, toSmtpConfig, sendEmail } from '@/lib/mailer';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const dynamic = 'force-dynamic';

/**
 * Request a password-reset link (participants, mentors and advisors — admins have no
 * email on their accounts and reset through an operator instead).
 *
 * The token is a stateless 30-minute JWT with a dedicated `purpose` claim, so
 * no DB table is needed and login tokens can never be replayed here.
 *
 * Responses are identical whether or not the email exists — no account
 * enumeration. The only non-generic errors are operational (SMTP not
 * configured / send failure), which reveal nothing about the account.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';

    if (!email) {
      return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 });
    }

    const genericOk = () =>
      NextResponse.json({
        success: true,
        message:
          'إذا كان البريد الإلكتروني مسجلاً لدينا، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.',
      });

    // Same lookup order as the login route: participant, mentor, then advisor.
    // Try the address as typed, then lowercased (addresses are stored as typed).
    const candidates = Array.from(new Set([email, email.toLowerCase()]));
    let account: { userType: 'participant' | 'mentor' | 'advisor'; id: string } | null = null;
    for (const candidate of candidates) {
      const participant = await prisma.participant.findUnique({ where: { email: candidate } });
      if (participant) {
        account = { userType: 'participant', id: participant.id };
        break;
      }
      const mentor = await prisma.mentor.findUnique({ where: { email: candidate } });
      if (mentor) {
        account = { userType: 'mentor', id: mentor.id };
        break;
      }
      const advisor = await prisma.advisor.findUnique({ where: { email: candidate } });
      if (advisor) {
        account = { userType: 'advisor', id: advisor.id };
        break;
      }
    }

    if (!account) return genericOk();

    const settings = await getEmailSettings();
    const config = settings ? toSmtpConfig(settings) : null;
    if (!config) {
      return NextResponse.json(
        { error: 'خدمة البريد الإلكتروني غير مفعلة حالياً. يرجى التواصل مع المنظمين لإعادة تعيين كلمة المرور.' },
        { status: 503 }
      );
    }

    const token = jwt.sign(
      { purpose: 'password-reset', userType: account.userType, id: account.id },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const resetUrl = `${proto}://${host}/reset-password?token=${encodeURIComponent(token)}`;

    const result = await sendEmail({
      config,
      to: email,
      subject: 'إعادة تعيين كلمة المرور',
      title: 'إعادة تعيين كلمة المرور',
      bodyText:
        `وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.\n\n` +
        `لإعادة التعيين افتح الرابط التالي (صالح لمدة 30 دقيقة):\n${resetUrl}\n\n` +
        `إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — كلمة المرور الحالية لم تتغير.`,
    });

    if (!result.ok) {
      console.error('Password reset email failed:', result.error);
      return NextResponse.json(
        { error: 'تعذر إرسال البريد الإلكتروني. حاول مرة أخرى لاحقاً.' },
        { status: 500 }
      );
    }

    return genericOk();
  } catch (error) {
    console.error('Error in forgot-password:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
