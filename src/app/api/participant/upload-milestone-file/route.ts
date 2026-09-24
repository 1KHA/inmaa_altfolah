import { NextRequest, NextResponse } from "next/server";
import { uploadToStorage } from "@/lib/supabase-storage";
import { safeExtension } from "@/lib/storage-keys";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB, ALLOWED_FILE_TYPES } from "@/lib/constants";

// Ensure this route is dynamic
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('Milestone file upload request received');
    
    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    console.log(`File received: ${file ? `${file.name} (${file.size} bytes, ${file.type})` : 'No file'}`);

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size must be less than ${MAX_FILE_SIZE_MB}MB` },
        { status: 400 }
      );
    }

    // Validate file type
    if (ALLOWED_FILE_TYPES.length > 0) {
      const isValidFileType = ALLOWED_FILE_TYPES.includes(file.type);
      if (!isValidFileType) {
        return NextResponse.json(
          { error: "File type not allowed. Please upload a PDF, Word, PowerPoint, ZIP, RAR, JPEG, or PNG file." },
          { status: 400 }
        );
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExt = safeExtension(file.name); // ASCII-only — storage rejects non-ASCII keys
    const fileName = `${timestamp}_${randomString}.${fileExt}`;

    try {
      // Upload file to Supabase storage in 'milestones' folder
      // This uses the service role key which is only available on the server
      const publicUrl = await uploadToStorage(file, fileName, 'milestones');
      
      console.log(`File successfully uploaded to Supabase storage: ${publicUrl}`);

      // Return the public URL and original filename
      return NextResponse.json({
        success: true,
        publicUrl,
        fileName: file.name
      });
    } catch (error) {
      console.error('Error uploading file to Supabase storage:', error);
      
      // Extract more specific error message if available
      let errorMessage = 'Failed to upload file to storage';
      
      if (error instanceof Error) {
        // Check for specific error types
        if (error.message.includes('row-level security policy')) {
          errorMessage = 'Permission denied: Row-level security policy violation';
        } else if (error.message.includes('not defined in environment variables')) {
          errorMessage = 'Server configuration error: Missing environment variables';
        } else if (error.message.includes('bucket')) {
          errorMessage = 'Storage bucket error: The milestones folder may not exist';
        } else {
          // Use the original error message if it's available
          errorMessage = error.message;
        }
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing file upload:', error);
    return NextResponse.json(
      { error: 'Failed to process file upload' },
      { status: 500 }
    );
  }
}
