import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdvisor } from '@/lib/notification-auth';
import { requireActiveAdvisor } from '@/lib/account-status';

export const dynamic = 'force-dynamic';

/**
 * The signed-in advisor. Polled by AdvisorRouteGuard, so a disabled or
 * deleted advisor is bounced out of the dashboard (403) on the next page.
 */
export async function GET(request: NextRequest) {
  try {
    const advisorId = requireAdvisor(request.cookies.get('token')?.value);
    if (!advisorId) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }
    const blocked = await requireActiveAdvisor(advisorId);
    if (blocked) return blocked;

    const advisor = await prisma.advisor.findUnique({ where: { id: advisorId } });
    if (!advisor) {
      return NextResponse.json({ message: 'Advisor not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      id: advisor.id,
      email: advisor.email,
      name: advisor.name,
      role: 'advisor',
      phone: advisor.phone,
      specialty: advisor.specialty,
    });
  } catch (error) {
    console.error('Failed to get advisor profile:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
