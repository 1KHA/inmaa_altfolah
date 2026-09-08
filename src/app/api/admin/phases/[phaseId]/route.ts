import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/**
 * PUT — rename, re-describe, reorder, or disable a phase.
 *
 * Disabling is DERIVED: members are blocked while the phase is disabled but
 * their own rows are untouched, so re-enabling restores exactly the right
 * people (same design as disabling a team).
 */
export async function PUT(request: NextRequest, { params }: { params: { phaseId: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const phase = await prisma.phase.findUnique({ where: { id: params.phaseId } });
    if (!phase) return NextResponse.json({ error: 'المرحلة غير موجودة' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'اسم المرحلة مطلوب' }, { status: 400 });
      const clash = await prisma.phase.findUnique({ where: { name } });
      if (clash && clash.id !== phase.id) return NextResponse.json({ error: 'يوجد مرحلة بنفس الاسم' }, { status: 400 });
      data.name = name;
    }
    if (body.description !== undefined) data.description = String(body.description).trim() || null;

    if (body.order !== undefined) {
      const order = Number.parseInt(String(body.order), 10);
      if (!Number.isInteger(order)) return NextResponse.json({ error: 'ترتيب غير صالح' }, { status: 400 });
      const clash = await prisma.phase.findUnique({ where: { order } });
      if (clash && clash.id !== phase.id) {
        // Swap the two orders in one transaction so `order` stays unique.
        // A temporary negative value avoids tripping the constraint mid-swap.
        await prisma.$transaction([
          prisma.phase.update({ where: { id: phase.id }, data: { order: -Math.abs(phase.order) - 1000 } }),
          prisma.phase.update({ where: { id: clash.id }, data: { order: phase.order } }),
          prisma.phase.update({ where: { id: phase.id }, data: { order } }),
        ]);
      } else {
        data.order = order;
      }
    }

    if (body.isDisabled !== undefined) {
      data.isDisabled = Boolean(body.isDisabled);
      data.disabledAt = body.isDisabled ? new Date() : null;
    }

    const updated = Object.keys(data).length
      ? await prisma.phase.update({ where: { id: phase.id }, data })
      : await prisma.phase.findUnique({ where: { id: phase.id } });

    return NextResponse.json({ success: true, phase: updated });
  } catch (error) {
    console.error('Error updating phase:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/** DELETE — refused while anything still references the phase. */
export async function DELETE(_request: NextRequest, { params }: { params: { phaseId: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();
  try {
    const [teams, participants, milestones] = await Promise.all([
      prisma.team.count({ where: { phaseId: params.phaseId } }),
      prisma.participant.count({ where: { phaseId: params.phaseId } }),
      prisma.milestone.count({ where: { phaseId: params.phaseId } }),
    ]);
    if (teams + participants + milestones > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف المرحلة: مرتبطة بـ ${teams} فريق و ${participants} مشارك و ${milestones} تسليم. انقلهم أولاً.`,
          teams, participants, milestones,
        },
        { status: 400 }
      );
    }
    await prisma.phase.delete({ where: { id: params.phaseId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting phase:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
