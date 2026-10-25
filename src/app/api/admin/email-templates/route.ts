import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { TEMPLATE_DEFAULTS } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/**
 * GET — merged view of every notification template: the code defaults with
 * any DB override applied, plus an isCustomized flag.
 */
export async function GET() {
  if (!requireAdmin(cookies().get('token')?.value)) {
    return NextResponse.json(
      { error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' },
      { status: 401 }
    );
  }

  try {
    const rows = await prisma.notificationTemplate.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    const templates = Object.values(TEMPLATE_DEFAULTS).map((d) => {
      const row = byKey.get(d.key);
      return {
        key: d.key,
        label: d.label,
        category: d.category,
        variables: d.variables,
        type: d.type,
        bulk: Boolean(d.bulk),
        dashboardTitle: row?.dashboardTitle ?? d.dashboardTitle,
        dashboardMessage: row?.dashboardMessage ?? d.dashboardMessage,
        emailSubject: row?.emailSubject ?? d.emailSubject,
        emailBody: row?.emailBody ?? d.emailBody,
        emailEnabled: row?.emailEnabled ?? d.emailEnabled ?? true,
        actionUrl: row?.actionUrl ?? d.actionUrl ?? null,
        isCustomized: Boolean(row),
        defaults: {
          dashboardTitle: d.dashboardTitle,
          dashboardMessage: d.dashboardMessage,
          emailSubject: d.emailSubject,
          emailBody: d.emailBody,
        },
      };
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
