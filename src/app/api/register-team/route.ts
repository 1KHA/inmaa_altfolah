import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PrismaClient } from '@prisma/client'
import { dispatchNotification } from '@/lib/notify'
import { uploadToStorage } from '@/lib/supabase-storage'
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '@/lib/constants'

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const registrationType = formData.get('registrationType') as string;
    const isTeamRegistration = formData.get('isTeamRegistration') === 'true';
    
    // Parse participant data
    const leaderInfo = JSON.parse(formData.get('leaderInfo') as string || '{}');
    const members = isTeamRegistration ? JSON.parse(formData.get('members') as string || '[]') : [];
    
    // Team-specific data
    const teamName = isTeamRegistration ? formData.get('teamName') as string : null;
    const hackathonTrack = formData.get('hackathonTrack') as string; // Required for both individual and team
    const ideaDescription = isTeamRegistration ? formData.get('ideaDescription') as string : null;
    const hearAboutUs = isTeamRegistration ? formData.get('hearAboutUs') as string : null;
    
    const attachmentFile = formData.get('attachment') as File | null;
    let attachmentPath: string | null = null;

    // Preferred path: the browser already uploaded the file to Supabase
    // Storage and sends only its public URL (keeps the function body tiny —
    // Vercel rejects bodies over ~4.5 MB before this code runs).
    const preUploaded = String(formData.get('attachmentPath') || '').trim();
    if (preUploaded) {
        if (!/^https:\/\/[^\s]+\/storage\/v1\/object\/public\//.test(preUploaded)) {
            return NextResponse.json({ error: 'رابط المرفق غير صالح' }, { status: 400 });
        }
        attachmentPath = preUploaded;
    } else if (attachmentFile) {
        // Validate file size
        if (attachmentFile.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File size must be less than ${MAX_FILE_SIZE_MB}MB` },
                { status: 400 }
            );
        }

        try {
            const filename = `${Date.now()}_${attachmentFile.name}`;
            // Upload file to Supabase storage in 'teams' folder
            attachmentPath = await uploadToStorage(attachmentFile, filename, 'teams');
        } catch (error) {
            console.error('Error uploading attachment to Supabase storage:', error);
            return NextResponse.json(
                { error: 'Failed to upload attachment' },
                { status: 500 }
            );
        }
    }

    // Basic validation
    if (!leaderInfo || !leaderInfo.email || !leaderInfo.fullName) {
      return NextResponse.json({ error: 'Required participant fields are missing.' }, { status: 400 })
    }
    
    // Hackathon track is required for both individual and team registrations
    if (!hackathonTrack) {
      return NextResponse.json({ error: 'Hackathon track selection is required.' }, { status: 400 })
    }
    
    if (isTeamRegistration) {
      if (!teamName || !ideaDescription) {
        return NextResponse.json({ error: 'Required team fields are missing.' }, { status: 400 })
      }
      
      if (!members || members.length < 2 || members.length > 4) {
        return NextResponse.json({ error: 'A team must have between 3 and 5 members total (including leader).' }, { status: 400 })
      }
    }

    // Check if any email already exists
    const allEmails = [leaderInfo.email, ...members.map((m: any) => m.email)].filter(Boolean)
    if (allEmails.length > 0) {
      const existingParticipants = await prisma.participant.findMany({
        where: { email: { in: allEmails } },
      })

      if (existingParticipants.length > 0) {
        return NextResponse.json(
          { error: 'One or more email addresses are already registered.' },
          { status: 400 }
        )
      }
    }

    const result = await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      let teamId = null;
      let finalTeamName = '';

      if (isTeamRegistration) {
        // Create team record only for team registrations
        const team = await tx.team.create({
          data: {
            teamName: teamName!,
            status: 'pending',
            hackathonTrack: hackathonTrack || '',
            ideaDescription: ideaDescription || '',
            hearAboutUs: hearAboutUs || '',
            isTeamRegistration: true,
            attachmentPath: attachmentPath,
            // Keep deprecated fields for backward compatibility
            challenge: hackathonTrack || '',
            challengeReason: '',
            ideaName: teamName!,
            ideaSolution: '',
            ideaResults: '',
            ideaStage: 'idea',
            hasParticipated: false,
            participationDetails: hearAboutUs || '',
          },
        });
        teamId = team.id;
        finalTeamName = teamName!;
      } else {
        // For individual registrations, no team is created
        finalTeamName = `Individual - ${leaderInfo.fullName}`;
      }

      // Create leader/individual participant
      await tx.participant.create({
        data: {
          // Use NEW CSV-based fields (primary)
          fullName: leaderInfo.fullName || '',
          contactNumber: leaderInfo.contactNumber || '',
          email: leaderInfo.email,
          gender: leaderInfo.gender || '',
          isUniversityStudent: leaderInfo.isUniversityStudent || false,
          universityMajor: leaderInfo.universityMajor || '',
          university: leaderInfo.university || '',
          professionalField: leaderInfo.professionalField || '',
          city: leaderInfo.city || '',
          canAttendHackathon: leaderInfo.canAttendHackathon || false,
          isLeader: isTeamRegistration, // Only team leaders are leaders
          teamId: teamId, // null for individuals, team ID for team members
          // Keep deprecated fields for backward compatibility
          firstName: leaderInfo.fullName || '',
          secondName: '',
          familyName: '',
          nationalId: '',
          dob: '',
          phoneNumber: leaderInfo.contactNumber || '',
          education: leaderInfo.universityMajor || '',
          major: leaderInfo.universityMajor || '',
          employmentStatus: leaderInfo.professionalField || '',
          nationality: leaderInfo.gender || '',
          residence: leaderInfo.city || '',
          canAttend: leaderInfo.canAttendHackathon || false,
        },
      });

      // Create team members if it's a team registration
      if (isTeamRegistration && members && members.length > 0) {
        for (const member of members) {
          await tx.participant.create({
            data: {
              // Use NEW CSV-based fields (primary)
              fullName: member.fullName || '',
              contactNumber: member.contactNumber || '',
              email: member.email,
              gender: member.gender || '',
              isUniversityStudent: member.isUniversityStudent || false,
              universityMajor: member.universityMajor || '',
              university: member.university || '',
              professionalField: member.professionalField || '',
              city: member.city || '',
              canAttendHackathon: member.canAttendHackathon || false,
              isLeader: false,
              teamId: teamId,
              // Keep deprecated fields for backward compatibility
              firstName: member.fullName || '',
              secondName: '',
              familyName: '',
              nationalId: '',
              dob: '',
              phoneNumber: member.contactNumber || '',
              education: member.universityMajor || '',
              major: member.universityMajor || '',
              employmentStatus: member.professionalField || '',
              nationality: member.gender || '',
              residence: member.city || '',
              canAttend: member.canAttendHackathon || false,
            },
          })
        }
      }

      return { teamId, teamName: finalTeamName };
    })

    // Create notification for admins about new registration
    try {
      await dispatchNotification({
        templateKey: 'newTeamRegistration',
        variables: { teamName: result.teamName },
        audience: { kind: 'admins' },
        relatedEntityType: isTeamRegistration ? 'team' : 'participant',
        relatedEntityId: result.teamId || undefined,
      });
    } catch (notificationError) {
      console.error('Error creating notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    return NextResponse.json(
      {
        success: true,
        message: `${isTeamRegistration ? 'Team' : 'Individual'} registration submitted successfully`,
        teamId: result.teamId,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error registering:', error)
    return NextResponse.json(
      { error: 'Failed to register' },
      { status: 500 }
    )
  }
}
