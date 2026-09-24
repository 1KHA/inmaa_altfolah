import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { ORG_SELECT, readOrgBody, storeLogo } from '@/lib/organization-admin';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/** GET — all organizations with their members (admin). */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const organizations = await prisma.organization.findMany({ orderBy: { name: 'asc' }, select: ORG_SELECT });
    return NextResponse.json({ organizations });
  } catch (error) {
    console.error('Error listing organizations:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/** POST — create an organization (JSON or multipart with `logo`). */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await readOrgBody(request);
    const name = (body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'اسم الجهة مطلوب' }, { status: 400 });
    if (await prisma.organization.findUnique({ where: { name } })) {
      return NextResponse.json({ error: 'توجد جهة بهذا الاسم بالفعل' }, { status: 400 });
    }
    let logoUrl: string | null = null;
    if (body.logo) {
      try { logoUrl = await storeLogo(body.logo); }
      catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
    }
    const organization = await prisma.organization.create({
      data: { name, description: (body.description || '').trim() || null, logoUrl },
      select: ORG_SELECT,
    });
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    console.error('Error creating organization:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
