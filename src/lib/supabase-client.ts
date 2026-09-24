import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { safeExtension } from './storage-keys';

// Client-side Supabase client using anon key (safe for browser).
// Created lazily: this module is also evaluated on the server while Next
// prerenders pages that import it, so it must not throw at import time when
// the env vars are absent (e.g. during `next build`).
let client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (client) return client;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

/** Kept for call sites that expect the eager export; resolves on first use. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getSupabase() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

/**
 * Ensures that the bucket exists
 */
async function ensureBucketExists(): Promise<void> {
  try {
    // List buckets to check if our bucket exists
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Error listing buckets:', error);
      return;
    }
    
    // Check if our bucket exists
    const bucketExists = buckets.some(bucket => bucket.name === 'uploads');
    
    if (!bucketExists) {
      // Create the bucket if it doesn't exist
      const { error: createError } = await supabase.storage.createBucket('uploads', {
        public: true, // Make bucket public
      });
      
      if (createError) {
        console.error(`Error creating bucket uploads:`, createError);
      } else {
        console.log(`Created bucket uploads`);
      }
    }
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
  }
}

/**
 * Ensures that a folder exists in the storage bucket
 * @param folder The folder to ensure exists
 */
async function ensureFolderExists(folder: string): Promise<void> {
  if (!folder) return; // No folder to create
  
  try {
    // First ensure the bucket exists
    await ensureBucketExists();
    
    // Check if folder exists
    const { data, error } = await supabase.storage
      .from('uploads')
      .list(folder);
    
    if (error) {
      // If error is not "not found", throw it
      if (error.message !== 'Bucket not found' && !error.message.includes('not found')) {
        throw error;
      }
      
      // Create an empty file in the folder to create it
      // This is a common workaround since many storage systems don't have explicit "create folder" operations
      await supabase.storage
        .from('uploads')
        .upload(`${folder}/.folder`, new Blob([''], { type: 'text/plain' }), {
          upsert: true
        });
    }
  } catch (error) {
    console.error(`Error ensuring folder ${folder} exists:`, error);
    // Don't throw, just log - we'll let the upload handle any errors
  }
}

/**
 * Upload a file directly to Supabase Storage from the browser
 * @param file The file to upload
 * @param folder The folder to upload to (e.g., 'milestones')
 * @returns Object containing the file path and public URL
 */
export async function uploadFileToSupabase(
  file: File,
  folder: string = 'milestones'
): Promise<{ filePath: string; publicUrl: string }> {
  try {
    // Ensure the folder exists
    await ensureFolderExists(folder);
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExt = safeExtension(file.name); // ASCII-only key — Arabic names are rejected by Storage
    const fileName = `${timestamp}_${randomString}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`فشل رفع الملف: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(filePath);

    return {
      filePath: data.path,
      publicUrl
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Delete a file from Supabase Storage
 * @param filePath The path of the file to delete
 */
export async function deleteFileFromSupabase(filePath: string): Promise<void> {
  try {
    // Ensure the bucket exists
    await ensureBucketExists();
    
    const { error } = await supabase.storage
      .from('uploads')
      .remove([filePath]);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new Error(`فشل حذف الملف: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}
