import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/notification-auth";
import { dispatchNotification } from "@/lib/notify";

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: "غير مصرح. هذه الخدمة متاحة للمسؤولين فقط." }, { status: 401 });

// Define the Event type
type EventFromDB = {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location: string;
  capacity: number;
  type: string;
  plan: string;
  presenter: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

// POST /api/admin/events - Create a new event
export async function POST(request: NextRequest) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const { title, description, startDate, endDate, location, capacity, type, plan, presenter, status } = body;

    // Validate required fields
    if (!title || !description || !startDate || !endDate || !location || !capacity || !type || !plan || !presenter) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Validate that the start date is not in the past
    const selectedStartDate = new Date(startDate);
    const currentDate = new Date();
    
    if (selectedStartDate < currentDate) {
      return NextResponse.json(
        { error: "لا يمكن اختيار تاريخ بداية في الماضي" },
        { status: 400 }
      );
    }

    // Validate that the end date is after the start date
    const selectedEndDate = new Date(endDate);
    
    if (selectedEndDate <= selectedStartDate) {
      return NextResponse.json(
        { error: "يجب أن يكون تاريخ النهاية بعد تاريخ البداية" },
        { status: 400 }
      );
    }

    // Validate capacity is a positive number
    if (typeof capacity !== 'number' || capacity <= 0) {
      return NextResponse.json(
        { error: "يجب أن تكون سعة الحضور رقماً موجباً" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const statusValue = status || "upcoming";
    const formattedStartDate = new Date(startDate).toISOString();
    const formattedEndDate = new Date(endDate).toISOString();

    // Create the new event using raw SQL
    await prisma.$executeRaw`
      INSERT INTO "Event" (id, title, description, "startDate", "endDate", location, capacity, type, plan, presenter, status, "createdAt", "updatedAt")
      VALUES (${id}, ${title}, ${description}, ${formattedStartDate}::timestamp, ${formattedEndDate}::timestamp, ${location}, ${capacity}, ${type}, ${plan}, ${presenter}, ${statusValue}, ${now}::timestamp, ${now}::timestamp)
    `;

    // Fetch the created event
    const newEvent = await prisma.$queryRaw<EventFromDB[]>`
      SELECT * FROM "Event" WHERE id = ${id}
    `;

    // Notify every participant about the new event (dashboard + email),
    // mirroring the newMilestoneAvailable flow. Never blocks event creation.
    try {
      const eventDate = new Date(startDate).toLocaleString('ar-SA', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      await dispatchNotification({
        templateKey: 'newEventAvailable',
        variables: { eventTitle: title, eventDate, location },
        audience: { kind: 'allParticipants' },
        relatedEntityType: 'event',
        relatedEntityId: id,
      });
    } catch (notificationError) {
      console.error('Error creating event notifications:', notificationError);
    }

    return NextResponse.json(newEvent[0], { status: 201 });
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}

// GET /api/admin/events - Get all events
export async function GET() {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const events = await prisma.$queryRaw<EventFromDB[]>`
      SELECT * FROM "Event" ORDER BY "startDate" DESC
    `;

    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/events - Update an event
export async function PUT(request: NextRequest) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const { id, title, description, startDate, endDate, location, capacity, type, plan, presenter, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Get the current event
    const currentEvent = await prisma.$queryRaw<EventFromDB[]>`
      SELECT * FROM "Event" WHERE id = ${id}
    `;

    if (currentEvent.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Prepare update values
    const updatedTitle = title !== undefined ? title : currentEvent[0].title;
    const updatedDescription = description !== undefined ? description : currentEvent[0].description;
    const updatedStartDate = startDate !== undefined ? new Date(startDate).toISOString() : currentEvent[0].startDate.toISOString();
    const updatedEndDate = endDate !== undefined ? new Date(endDate).toISOString() : currentEvent[0].endDate.toISOString();
    const updatedLocation = location !== undefined ? location : currentEvent[0].location;
    const updatedCapacity = capacity !== undefined ? capacity : currentEvent[0].capacity;
    const updatedType = type !== undefined ? type : currentEvent[0].type;
    const updatedPlan = plan !== undefined ? plan : currentEvent[0].plan;
    const updatedPresenter = presenter !== undefined ? presenter : currentEvent[0].presenter;
    const updatedStatus = status !== undefined ? status : currentEvent[0].status;
    const now = new Date().toISOString();

    // Update the event
    await prisma.$executeRaw`
      UPDATE "Event"
      SET title = ${updatedTitle},
          description = ${updatedDescription},
          "startDate" = ${updatedStartDate}::timestamp,
          "endDate" = ${updatedEndDate}::timestamp,
          location = ${updatedLocation},
          capacity = ${updatedCapacity},
          type = ${updatedType},
          plan = ${updatedPlan},
          presenter = ${updatedPresenter},
          status = ${updatedStatus},
          "updatedAt" = ${now}::timestamp
      WHERE id = ${id}
    `;

    // Fetch the updated event
    const updatedEvent = await prisma.$queryRaw<EventFromDB[]>`
      SELECT * FROM "Event" WHERE id = ${id}
    `;

    return NextResponse.json(updatedEvent[0]);
  } catch (error) {
    console.error("Error updating event:", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/events - Delete an event
export async function DELETE(request: NextRequest) {
  if (!requireAdmin(cookies().get("token")?.value)) return UNAUTHORIZED();
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Check if event exists
    const event = await prisma.$queryRaw<EventFromDB[]>`
      SELECT * FROM "Event" WHERE id = ${id}
    `;

    if (event.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Delete the event
    await prisma.$executeRaw`
      DELETE FROM "Event" WHERE id = ${id}
    `;

    return NextResponse.json(
      { message: "Event deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting event:", error);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}
