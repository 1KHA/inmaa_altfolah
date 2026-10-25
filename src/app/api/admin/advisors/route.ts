import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { ADVISOR_PUBLIC_SELECT, emailTakenByOtherAccount, issueAdvisorPassword, normalizeAdvisorEmail } from '@/lib/advisors';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () => NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

/** Every advisor, with how many reviews each has written. */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  try {
    const [advisors, counts] = await Promise.all([
      prisma.advisor.findMany({ select: ADVISOR_PUBLIC_SELECT, orderBy: { createdAt: 'asc' } }),
      prisma.practiceReview.groupBy({ by: ['reviewerId'], where: { reviewerType: 'advisor' }, _count: { _all: true } }),
    ]);
    const reviewCount = new Map(counts.map((c) => [c.reviewerId, c._count._all]));
    return NextResponse.json({
      advisors: advisors.map((a) => ({ ...a, reviewCount: reviewCount.get(a.id) ?? 0 })),
    });
  } catch (error) {
    console.error('Error listing advisors:', error);
    return NextResponse.json({ error: 'تعذر تحميل المستشارين' }, { status: 500 });
  }
}

/**
 * Add an advisor. Body: { name, email, phone?, specialty? }
 * A password is generated and emailed to them, and returned once for the admin.
 */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? normalizeAdvisorEmail(body.email) : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const specialty = typeof body?.specialty === 'string' ? body.specialty.trim() : '';

    if (!name || !email) {
      return NextResponse.json({ error: 'الاسم والبريد الإلكتروني مطلوبان' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    }
    if (await emailTakenByOtherAccount(email)) {
      return NextResponse.json({ error: 'هذا البريد مسجّل لمشارك أو مرشد؛ استخدم بريداً آخر للمستشار' }, { status: 409 });
    }

    const advisor = await prisma.advisor.create({
      data: { name, email, phone: phone || null, specialty: specialty || null },
      select: ADVISOR_PUBLIC_SELECT,
    });
    const password = await issueAdvisorPassword(advisor);

    return NextResponse.json({ success: true, advisor: { ...advisor, reviewCount: 0 }, password }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'يوجد مستشار بهذا البريد الإلكتروني' }, { status: 409 });
    }
    console.error('Error creating advisor:', error);
    return NextResponse.json({ error: 'تعذر إضافة المستشار' }, { status: 500 });
  }
}
