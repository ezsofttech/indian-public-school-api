const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dnw7mgysa',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function syncAllPdfs() {
  console.log('Fetching all raw documents in ips-education/assets/Documents...');
  try {
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'raw',
      prefix: 'ips-education/assets/Documents',
      max_results: 100
    });

    console.log(`Found ${res.resources.length} raw documents.`);

    for (const r of res.resources) {
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
          overwrite: true
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
