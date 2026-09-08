import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { PARTICIPANT_WITH_PHASE_FIELDS } from '@/lib/participant-fields';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log("🔍 /api/admin/participants - Starting request");
    console.log("🌐 Request URL:", request.url);
    
    // Get the auth token from cookies
    const cookieStore = cookies();
    const token = cookieStore.get("token")?.value || cookieStore.get("auth-token")?.value;
    
    console.log("🍪 Token cookie:", token ? "Present" : "Missing", token ? `(${token.length} chars)` : "");

    if (!token) {
      console.log("❌ No token provided");
      return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
    }

    // Verify the token and check if it's an admin
    let decodedToken;
    try {
      console.log("🔑 Attempting JWT verification...");
      console.log("🔐 JWT_SECRET exists:", !!process.env.JWT_SECRET);
      console.log("🔐 JWT_SECRET length:", process.env.JWT_SECRET?.length);
      
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { id?: string, adminId?: string, role?: string };
      console.log("✅ JWT verified successfully");
      console.log("🔑 Decoded token:", decodedToken);
    } catch (error) {
      console.log("❌ JWT verification failed:", error);
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    // Check if it's an admin token (could be in adminId or role field)
    if (!decodedToken || (!decodedToken.adminId && decodedToken.role !== 'admin')) {
      console.log("❌ Not an admin token:", decodedToken);
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    console.log("🔍 Email parameter:", email || "Not provided");

    let participants;
    
    try {
      if (email) {
        console.log("🔍 Finding individual participants by search term:", email);
        // Enhanced search across multiple fields (case insensitive)
        participants = await prisma.participant.findMany({
          where: {
            OR: [
              // Search by email
              { email: { contains: email.toLowerCase() } },
              // Search by fullName
              { fullName: { contains: email } },
              // Search by legacy name fields
              { firstName: { contains: email } },
              { secondName: { contains: email } },
              { familyName: { contains: email } },
              // Search by contact number
              { contactNumber: { contains: email } },
              { phoneNumber: { contains: email } },
              // Search by university
              { university: { contains: email } },
              // Search by major
              { universityMajor: { contains: email } },
              { major: { contains: email } },
              // Search by city
              { city: { contains: email } },
              { residence: { contains: email } },
            ],
            teamId: null // Only include participants without a team
          },
          select: PARTICIPANT_WITH_PHASE_FIELDS,
          orderBy: {
            createdAt: 'desc' // Sort by creation date, newest first
          }
        });
      } else {
        console.log("🔍 Finding all individual participants");
        // Return only individual participants (without a team)
        participants = await prisma.participant.findMany({
          where: {
            teamId: null // Only include participants without a team
          },
          select: PARTICIPANT_WITH_PHASE_FIELDS,
          orderBy: {
            createdAt: 'desc' // Sort by creation date, newest first
          }
        });
      }
      console.log(`✅ Found ${participants.length} participants`);
    } catch (dbError) {
      console.error("❌ Database error:", dbError);
      return NextResponse.json({ error: "Database error: " + (dbError instanceof Error ? dbError.message : String(dbError)) }, { status: 500 });
    }

    // Add computed fullName to each participant
    const participantsWithFullName = participants.map(p => ({
      ...p,
      fullName: p.fullName || `${p.firstName || ''} ${p.secondName || ''} ${p.familyName || ''}`.trim() || p.email,
    }));

    console.log("✅ Successfully processed participants");
    return NextResponse.json(participantsWithFullName);
  } catch (error) {
    console.error("❌ Error fetching participants:", error);
    return NextResponse.json({ error: "Failed to fetch participants: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
