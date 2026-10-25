import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/notification-auth';
import { TEMPLATE_DEFAULTS } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'غير مصرح. هذه الخدمة متاحة للمسؤولين فقط.' }, { status: 401 });

/** Placeholders used in a text that are not declared for the template. */
function unknownPlaceholders(text: string, allowed: string[]): string[] {
  const used = new Set<string>();
  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    used.add(match[1]);
  }
  return Array.from(used).filter((name) => !allowed.includes(name));
}

/**
 * PUT — upsert the override row for one template key.
 */
export async function PUT(request: NextRequest, { params }: { params: { key: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  const defaults = TEMPLATE_DEFAULTS[params.key];
  if (!defaults) {
    return NextResponse.json({ error: 'قالب غير معروف' }, { status: 404 });
  }

  try {
    const body = await request.json();

    const fields = {
      dashboardTitle: String(body.dashboardTitle ?? defaults.dashboardTitle),
      dashboardMessage: String(body.dashboardMessage ?? defaults.dashboardMessage),
      emailSubject: String(body.emailSubject ?? defaults.emailSubject),
      emailBody: String(body.emailBody ?? defaults.emailBody),
      emailEnabled: Boolean(body.emailEnabled ?? defaults.emailEnabled ?? true),
      actionUrl: body.actionUrl ? String(body.actionUrl) : null,
    };

    if (!fields.dashboardTitle.trim() || !fields.dashboardMessage.trim()) {
      return NextResponse.json({ error: 'عنوان الإشعار ونصه مطلوبان' }, { status: 400 });
    }

    // Validate placeholders against the declared variable list
    for (const [label, text] of [
      ['عنوان الإشعار', fields.dashboardTitle],
      ['نص الإشعار', fields.dashboardMessage],
      ['عنوان البريد', fields.emailSubject],
      ['نص البريد', fields.emailBody],
    ] as const) {
      const bad = unknownPlaceholders(text, defaults.variables);
      if (bad.length > 0) {
        return NextResponse.json(
          {
            error: `${label} يحتوي على متغيرات غير معروفة: ${bad.map((b) => `{{${b}}}`).join('، ')}. المتغيرات المتاحة: ${defaults.variables.map((v) => `{{${v}}}`).join('، ') || 'لا يوجد'}`,
          },
          { status: 400 }
        );
      }
    }

    const row = await prisma.notificationTemplate.upsert({
      where: { key: params.key },
      create: {
        key: params.key,
        label: defaults.label,
        category: defaults.category,
        variables: JSON.stringify(defaults.variables),
        ...fields,
      },
      update: fields,
    });

    return NextResponse.json({ success: true, template: row });
  } catch (error) {
    console.error(`Error updating template ${params.key}:`, error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

/**
 * DELETE — reset to defaults by removing the override row.
 */
export async function DELETE(request: NextRequest, { params }: { params: { key: string } }) {
  if (!requireAdmin(cookies().get('token')?.value)) return UNAUTHORIZED();

  if (!TEMPLATE_DEFAULTS[params.key]) {
    return NextResponse.json({ error: 'قالب غير معروف' }, { status: 404 });
  }

  try {
    await prisma.notificationTemplate.deleteMany({ where: { key: params.key } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error resetting template ${params.key}:`, error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
