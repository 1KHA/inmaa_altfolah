import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { phaseCounts } from '@/lib/phases';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/** GET — all phases in order, each with live team/participant/failed counts. */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const [phases, counts] = await Promise.all([
      prisma.phase.findMany({ orderBy: { order: 'asc' } }),
      phaseCounts(),
    ]);
    return NextResponse.json({
      phases: phases.map((p) => ({
        ...p,
        counts: counts[p.id] ?? { teams: 0, teamsFailed: 0, participants: 0, participantsFailed: 0 },
      })),
    });
  } catch (error) {
    console.error('Error listing phases:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/** POST — create a phase. `order` defaults to the end of the pipeline. */
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'اسم المرحلة مطلوب' }, { status: 400 });

    const existing = await prisma.phase.findUnique({ where: { name } });
    if (existing) return NextResponse.json({ error: 'يوجد مرحلة بنفس الاسم' }, { status: 400 });

    let order = Number.parseInt(String(body.order ?? ''), 10);
    if (!Number.isInteger(order)) {
      const last = await prisma.phase.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
      order = (last?.order ?? 0) + 1;
    } else if (await prisma.phase.findUnique({ where: { order } })) {
      return NextResponse.json({ error: 'يوجد مرحلة بنفس الترتيب' }, { status: 400 });
    }

    const phase = await prisma.phase.create({
      data: { name, order, description: String(body.description || '').trim() || null },
    });
    return NextResponse.json({ success: true, phase }, { status: 201 });
  } catch (error) {
    console.error('Error creating phase:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
