import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { ADVISOR_PUBLIC_SELECT, issueAdvisorPassword } from '@/lib/advisors';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () => NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

/**
 * Update an advisor. Body: { action: 'disable' | 'enable' | 'resetPassword' }
 * or { name?, phone?, specialty? } to edit their details.
 * resetPassword emails a new password and returns it once for the admin.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  try {
    const body = await request.json().catch(() => null);
    const existing = await prisma.advisor.findUnique({ where: { id: params.id }, select: ADVISOR_PUBLIC_SELECT });
    if (!existing) return NextResponse.json({ error: 'المستشار غير موجود' }, { status: 404 });

    if (body?.action === 'disable' || body?.action === 'enable') {
      const disabled = body.action === 'disable';
      const advisor = await prisma.advisor.update({
        where: { id: params.id },
        data: { isDisabled: disabled, disabledAt: disabled ? new Date() : null },
        select: ADVISOR_PUBLIC_SELECT,
      });
      return NextResponse.json({ success: true, advisor });
    }

    if (body?.action === 'resetPassword') {
      if (existing.isDisabled) {
        return NextResponse.json({ error: 'فعّل حساب المستشار أولاً' }, { status: 409 });
      }
      const password = await issueAdvisorPassword(existing);
      return NextResponse.json({ success: true, advisor: existing, password });
    }

    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
    const name = text(body?.name);
    if (name === '') return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    const advisor = await prisma.advisor.update({
      where: { id: params.id },
      data: {
        ...(name ? { name } : {}),
        ...(text(body?.phone) !== undefined ? { phone: text(body?.phone) || null } : {}),
        ...(text(body?.specialty) !== undefined ? { specialty: text(body?.specialty) || null } : {}),
      },
      select: ADVISOR_PUBLIC_SELECT,
    });
    return NextResponse.json({ success: true, advisor });
  } catch (error) {
    console.error('Error updating advisor:', error);
    return NextResponse.json({ error: 'تعذر تحديث المستشار' }, { status: 500 });
  }
}

/** Delete an advisor. Their past reviews stay, under the name they had. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  try {
    await prisma.advisor.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'المستشار غير موجود' }, { status: 404 });
    }
    console.error('Error deleting advisor:', error);
    return NextResponse.json({ error: 'تعذر حذف المستشار' }, { status: 500 });
  }
}
