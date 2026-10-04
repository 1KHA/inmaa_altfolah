import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { decryptSecret } from '@/lib/crypto';
import { sendEmail, type SmtpConfig } from '@/lib/mailer';
import { isResendConfigured } from '@/lib/resend';

export const dynamic = 'force-dynamic';

/**
 * POST — send a test email using the POSTED (possibly unsaved) form values.
 * Blank password falls back to the saved row's password, mirroring PUT
 * semantics so "test passed but save broke it" is impossible.
 * Nothing is persisted.
 */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const toEmail = String(body.toEmail || '').trim();

    if (!toEmail || !toEmail.includes('@')) {
      return NextResponse.json({ error: 'يرجى إدخال بريد إلكتروني صالح للاختبار' }, { status: 400 });
    }

    const saved = await prisma.emailSettings.findFirst();

    // Blank posted password -> fall back to the saved (decrypted) one
    let password = String(body.password || '');
    if (!password && saved?.password) {
      password = decryptSecret(saved.password) || '';
    }

    const config: SmtpConfig = {
      host: String(body.host ?? saved?.host ?? '').trim(),
      port: Number.parseInt(String(body.port ?? saved?.port ?? 587), 10),
      secure: Boolean(body.secure ?? saved?.secure ?? false),
      username: String(body.username ?? saved?.username ?? '').trim(),
      password,
      fromEmail: String(body.fromEmail ?? saved?.fromEmail ?? '').trim(),
      fromName: String(body.fromName ?? saved?.fromName ?? '').trim(),
    };

    // Resend sends over HTTPS and ignores the SMTP fields entirely.
    if (!isResendConfigured() && (!config.host || !config.fromEmail)) {
      return NextResponse.json(
        { error: 'يرجى تعبئة خادم SMTP وبريد المُرسِل قبل الاختبار' },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      config,
      to: toEmail,
      subject: 'رسالة اختبار — هاكثون الطفولة',
      title: 'اختبار إعدادات البريد الإلكتروني',
      bodyText:
        'تهانينا! إذا وصلتك هذه الرسالة فإن إعدادات البريد الإلكتروني تعمل بشكل صحيح.\nيمكنك الآن تفعيل إشعارات البريد الإلكتروني من صفحة الإعدادات.',
    });

    if (result.ok) {
      return NextResponse.json({ success: true, messageId: result.messageId });
    }

    // Raw SMTP error is genuinely useful for debugging and never echoes credentials
    return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
