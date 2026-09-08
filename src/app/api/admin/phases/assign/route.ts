import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { applyPhaseMove, type MoveMode } from '@/lib/phases';

export const dynamic = 'force-dynamic';

const MODES: MoveMode[] = ['set', 'next', 'previous', 'fail', 'clear'];

/**
 * POST — move teams and/or participants between phases, one row or many.
 *
 * { teamIds?, participantIds?, mode: 'set'|'next'|'previous'|'fail'|'clear', phaseId? }
 *
 * `next`/`previous` move each row relative to its OWN phase, so a mixed
 * selection behaves sensibly, and the response reports how many moved, how
 * many were already at a boundary, and how many had no phase.
 */
export async function POST(request: NextRequest) {
  const adminId = requireAdmin(cookies().get('token')?.value);
  if (!adminId) {
    return NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const teamIds: string[] = Array.isArray(body.teamIds) ? body.teamIds : [];
    const participantIds: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];
    const mode = body.mode as MoveMode;

    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: `mode غير صالح. المسموح: ${MODES.join(', ')}` }, { status: 400 });
    }
    if (teamIds.length === 0 && participantIds.length === 0) {
      return NextResponse.json({ error: 'يرجى اختيار فريق أو مشارك واحد على الأقل' }, { status: 400 });
    }

    let phaseId: string | null = null;
    if (mode === 'set') {
      phaseId = body.phaseId ? String(body.phaseId) : null;
      if (!phaseId) return NextResponse.json({ error: 'يرجى اختيار المرحلة' }, { status: 400 });
      if (!(await prisma.phase.findUnique({ where: { id: phaseId }, select: { id: true } }))) {
        return NextResponse.json({ error: 'المرحلة غير موجودة' }, { status: 404 });
      }
    }

    const outcome = await applyPhaseMove({ teamIds, participantIds, mode, phaseId });
    console.log(`[phases] admin ${adminId} ${mode}: moved ${outcome.moved}, boundary ${outcome.atBoundary}, unassigned ${outcome.unassigned}`);
    return NextResponse.json({ success: true, mode, ...outcome });
  } catch (error) {
    console.error('Error applying phase move:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
