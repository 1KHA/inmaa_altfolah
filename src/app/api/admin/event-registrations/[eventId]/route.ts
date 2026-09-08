import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/notification-auth";

const UNAUTHORIZED = () =>
  NextResponse.json({ error: "غير مصرح. هذه الخدمة متاحة للمسؤولين فقط." }, { status: 401 });

// Define types for the registration data
type ParticipantData = {
  id: string;
  firstName: string;
  secondName: string;
  familyName: string;
  email: string;
  phoneNumber: string;
  isLeader: boolean;
  teamId: string;
};

type EventRegistration = {
  id: string;
  participantId: string;
  eventId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  participant: ParticipantData;
};

// GET /api/admin/event-registrations/[eventId]
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const { eventId } = params;
    
    // التحقق من وجود الفعالية
    const event = await prisma.$queryRaw`
      SELECT * FROM "Event" WHERE id = ${eventId}
    `;

    if (!event || (Array.isArray(event) && event.length === 0)) {

      return NextResponse.json(
        { error: "الفعالية غير موجودة" },
        { status: 404 }
      );
    }

    const eventData = Array.isArray(event) ? event[0] : event;

    // جلب جميع التسجيلات مع بيانات المشاركين
    const registrations = await prisma.$queryRaw`
      SELECT er.*, 
             p.id as participant_id, 
             p."firstName", 
             p."secondName", 
             p."familyName", 
             p."email", 
             p."phoneNumber", 
             p."isLeader", 
             p."teamId"
      FROM "EventRegistration" er
      JOIN "Participant" p ON er."participantId" = p.id
      WHERE er."eventId" = ${eventId}
      ORDER BY er."createdAt" DESC
    `;

    // تنسيق البيانات للعرض
    const formattedRegistrations = (registrations as any[]).map((reg: any) => ({
      id: reg.id,
      status: reg.status,
      registeredAt: reg.createdAt,
      participant: {
        id: reg.participant_id,
        name: reg.fullName || [reg.firstName, reg.secondName, reg.familyName].filter(Boolean).join(' ').trim() || reg.email,
        email: reg.email,
        phone: reg.phoneNumber,
        isLeader: reg.isLeader === 1 || reg.isLeader === true,
        teamId: reg.teamId,
      },
    }));

    return NextResponse.json({
      event: {
        id: eventData.id,
        title: eventData.title,
        startDate: eventData.startDate,
        capacity: eventData.capacity,
      },
      registrations: formattedRegistrations,
      totalRegistrations: formattedRegistrations.length,
    });
  } catch (error) {
    console.error("Error fetching event registrations:", error);
    return NextResponse.json(
      { error: "فشل في جلب تسجيلات الفعالية" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/event-registrations/[eventId]
// لتحديث حالة التسجيل (مثل تسجيل الحضور)
export async function PUT(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const { eventId } = params;
    const { registrationId, status } = await request.json();

    if (!registrationId || !status) {
      return NextResponse.json(
        { error: "معرف التسجيل والحالة مطلوبان" },
        { status: 400 }
      );
    }

    // التحقق من وجود التسجيل
    const registration = await prisma.$queryRaw`
      SELECT * FROM "EventRegistration" 
      WHERE id = ${registrationId} AND "eventId" = ${eventId}
    `;

    if (!registration || (Array.isArray(registration) && registration.length === 0)) {

      return NextResponse.json(
        { error: "التسجيل غير موجود" },
        { status: 404 }
      );
    }

    // تحديث حالة التسجيل
    await prisma.$executeRaw`
      UPDATE "EventRegistration"
      SET "status" = ${status}, "updatedAt" = ${new Date().toISOString()}::timestamp
      WHERE id = ${registrationId}
    `;
    
    // جلب التسجيل المحدث مع بيانات المشارك
    const updatedRegistration = await prisma.$queryRaw`
      SELECT er.*, 
             p.id as participant_id, 
             p."firstName", 
             p."secondName", 
             p."familyName", 
             p."email"
      FROM "EventRegistration" er
      JOIN "Participant" p ON er."participantId" = p.id
      WHERE er.id = ${registrationId}
    `;
    
    const regData = Array.isArray(updatedRegistration) ? updatedRegistration[0] : updatedRegistration;

    return NextResponse.json({
      message: "تم تحديث حالة التسجيل بنجاح",
      registration: {
        id: regData.id,
        status: regData.status,
        registeredAt: regData.createdAt,
        participant: {
          id: regData.participant_id,
          name: regData.fullName || [regData.firstName, regData.secondName, regData.familyName].filter(Boolean).join(' ').trim() || regData.email,
          email: regData.email,
        },
      },
    });
  } catch (error) {
    console.error("Error updating registration status:", error);
    return NextResponse.json(
      { error: "فشل في تحديث حالة التسجيل" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/event-registrations/[eventId]
// لإلغاء تسجيل مشارك
export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const { eventId } = params;
    const { registrationId } = await request.json();

    if (!registrationId) {
      return NextResponse.json(
        { error: "معرف التسجيل مطلوب" },
        { status: 400 }
      );
    }

    // التحقق من وجود التسجيل
    const registration = await prisma.$queryRaw`
      SELECT * FROM "EventRegistration" 
      WHERE id = ${registrationId} AND "eventId" = ${eventId}
    `;

    if (!registration || (Array.isArray(registration) && registration.length === 0)) {
      return NextResponse.json(
        { error: "التسجيل غير موجود" },
        { status: 404 }
      );
    }

    // حذف التسجيل
    await prisma.$executeRaw`
      DELETE FROM "EventRegistration"
      WHERE id = ${registrationId}
    `;

    return NextResponse.json({
      message: "تم إلغاء التسجيل بنجاح",
    });
  } catch (error) {
    console.error("Error deleting registration:", error);
    return NextResponse.json(
      { error: "فشل في إلغاء التسجيل" },
      { status: 500 }
    );
  }
}
