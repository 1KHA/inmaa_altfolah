import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { readOrgBody, storeLogo } from '@/lib/organization-admin';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/** PUT — rename / describe / replace or remove the logo. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const existing = await prisma.organization.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'الجهة غير موجودة' }, { status: 404 });

    const body = await readOrgBody(request);
    const data: { name?: string; description?: string | null; logoUrl?: string | null } = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'اسم الجهة مطلوب' }, { status: 400 });
      const dup = await prisma.organization.findUnique({ where: { name } });
      if (dup && dup.id !== params.id) return NextResponse.json({ error: 'توجد جهة بهذا الاسم بالفعل' }, { status: 400 });
      data.name = name;
    }
    if (body.description !== undefined) data.description = body.description.trim() || null;
    if (body.logo) {
      try { data.logoUrl = await storeLogo(body.logo); }
      catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
    } else if (body.removeLogo) {
      data.logoUrl = null;
    }

    const organization = await prisma.organization.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, description: true, logoUrl: true, updatedAt: true },
    });
    return NextResponse.json({ organization });
  } catch (error) {
    console.error('Error updating organization:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * DELETE — removes the organization. Members are detached (Mentor.organizationId
 * → NULL via FK) and past org bookings keep working as plain bookings.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const existing = await prisma.organization.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'الجهة غير موجودة' }, { status: 404 });
    await prisma.organization.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting organization:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
