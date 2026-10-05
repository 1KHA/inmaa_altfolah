/**
 * This script sets up the necessary storage bucket in Supabase
 * Run this script when deploying the application or after migrating from Vercel blob storage
 */

const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('./load-env');

// Load environment variables from .env file
loadEnv();

// Keep in step with STORAGE_BUCKET in src/lib/storage-keys.ts
const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'inmaa';
const REQUIRED_FOLDERS = ['milestones', 'teams'];

async function setupSupabaseStorage() {
  console.log('Setting up Supabase storage buckets...');

  // Validate environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the .env file');
    process.exit(1);
  }

  // Initialize Supabase client with service role key for admin privileges
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`);
    }

    const bucketExists = buckets.some(bucket => bucket.name === BUCKET_NAME);

    if (!bucketExists) {
      console.log(`Creating bucket: ${BUCKET_NAME}`);
      
      // Create the bucket with public access
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 26214400, // 25MB in bytes
      });

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }

      console.log(`Bucket '${BUCKET_NAME}' created successfully`);
    } else {
      console.log(`Bucket '${BUCKET_NAME}' already exists`);

      // Update bucket to ensure it has public access
      const { error: updateError } = await supabase.storage.updateBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 26214400, // 25MB in bytes
      });

      if (updateError) {
        throw new Error(`Failed to update bucket: ${updateError.message}`);
      }

      console.log(`Updated bucket '${BUCKET_NAME}' settings`);
    }

    // Create CORS policy
    try {
      const { error: corsError } = await supabase.storage.updateBucket(BUCKET_NAME, {
        corsRules: [
          {
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['*'],
            allowedOrigins: ['*'], 
            maxAgeSeconds: 3600,
            exposedHeaders: []
          }
        ]
      });

      if (corsError) {
        console.warn(`Warning: Could not set CORS policy: ${corsError.message}`);
        console.warn('Continuing with folder creation despite CORS policy error...');
      } else {
        console.log('CORS policy set successfully');
      }
    } catch (corsError) {
      console.warn(`Warning: Error setting CORS policy: ${corsError.message}`);
      console.warn('Continuing with folder creation despite CORS policy error...');
    }

    // Attempt to create folder structure
    for (const folder of REQUIRED_FOLDERS) {
      console.log(`Ensuring folder exists: ${folder}`);
      
      // We need to upload an empty file to "create" a folder in Supabase storage
      // Use Buffer instead of Blob for Node.js compatibility
      const emptyFile = Buffer.from('');
      const placeholderFilePath = `${folder}/.placeholder`;
      
      // Check if the placeholder file already exists
      const { data: existingFiles, error: listFilesError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folder);
      
      if (!listFilesError && (!existingFiles || existingFiles.length === 0)) {
        // Upload placeholder file to create the folder
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(placeholderFilePath, emptyFile);
        
        if (uploadError && uploadError.message !== 'The resource already exists') {
          console.warn(`Warning: Could not create folder '${folder}': ${uploadError.message}`);
        } else {
          console.log(`Folder '${folder}' created or already exists`);
        }
      } else if (listFilesError) {
        console.warn(`Warning: Could not check folder '${folder}': ${listFilesError.message}`);
      } else {
        console.log(`Folder '${folder}' already exists`);
      }
    }

    console.log('Supabase storage setup completed successfully!');

  } catch (error) {
    console.error('Error setting up Supabase storage:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupSupabaseStorage();
