import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken, resolveRecipient } from '@/lib/notification-auth';
import { getBookingMode, listOrganizationsPublic, organizationSlots } from '@/lib/organizations';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/organizations            — organizations participants can book
 * GET /api/organizations?id=<orgId>  — one organization + its bookable slots
 *
 * Any signed-in user. Member names are hidden when the booking mode is
 * organization-only (the whole point of that mode).
 */
export async function GET(request: NextRequest) {
  const claims = verifyToken(cookies().get('token')?.value);
  if (!claims) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  try {
    const mode = await getBookingMode();
    const revealMentors = claims.role === 'admin' || mode !== 'organization';
    const recipient = resolveRecipient(claims);
    const viewerParticipantId = recipient?.recipientType === 'participant' ? recipient.recipientId : undefined;

    const id = request.nextUrl.searchParams.get('id');
    if (id) {
      const org = await prisma.organization.findUnique({
        where: { id },
        select: { id: true, name: true, description: true, logoUrl: true },
      });
      if (!org) return NextResponse.json({ error: 'الجهة غير موجودة' }, { status: 404 });
      const slots = await organizationSlots(id, { viewerParticipantId, revealMentors });
      return NextResponse.json({ mode, organization: org, slots });
    }

    const organizations = await listOrganizationsPublic(revealMentors);
    return NextResponse.json({ mode, organizations });
  } catch (error) {
    console.error('Error listing organizations:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
