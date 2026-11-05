const cloudinary = require('cloudinary').v2;
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const requiredEnv = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]?.trim());
if (missingEnv.length > 0) {
  console.error(`[assets:sync-pdf] Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function syncAllPdfs() {
  console.log('Fetching all raw documents in ips-education/assets/Documents...');
  try {
    const resources = [];
    let nextCursor;
    do {
      const res = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'raw',
        prefix: 'ips-education/assets/Documents',
        max_results: 100,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });
      resources.push(...(res.resources || []));
      nextCursor = res.next_cursor;
    } while (nextCursor);

    console.log(`Found ${resources.length} raw documents.`);

    for (const r of resources) {
      if (!r.secure_url.toLowerCase().endsWith('.pdf') && !r.public_id.toLowerCase().endsWith('.pdf')) {
        continue;
      }

      // Desired public_id under image resource_type
      // E.g. ips-education/assets/Documents/ADMISSION_FORM (without .pdf extension, format: 'pdf')
      let targetPublicId = r.public_id.replace(/\.pdf$/i, '');

      console.log(`Syncing ${r.public_id} -> image resource ${targetPublicId}...`);
      try {
        const uploadRes = await cloudinary.uploader.upload(r.secure_url, {
          public_id: targetPublicId,
          resource_type: 'image',
          format: 'pdf',
          overwrite: true,
          invalidate: true,
        });
        console.log(`✓ Success: ${uploadRes.public_id} -> ${uploadRes.secure_url}`);
      } catch (uploadErr) {
        console.error(`✗ Failed uploading ${r.public_id}:`, uploadErr.message);
      }
    }

    console.log('Sync completed successfully.');
  } catch (err) {
    console.error('Error in syncAllPdfs:', err);
  }
}

syncAllPdfs();
