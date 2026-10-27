const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'niefrrkx',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function run() {
  console.log('--- Checking MongoDB ---');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const docs = await db.collection('galleries').find({
    $or: [
      { eventType: /admission/i },
      { directory: /admission/i },
      { eventName: /admission/i },
      { fileUrl: /admission/i }
    ]
  }).toArray();
  console.log('MongoDB Admission count:', docs.length);
  docs.forEach(d => console.log('DB ID:', d._id, 'name:', d.eventName, 'dir:', d.directory, 'urls:', d.fileUrl));

  console.log('\n--- Checking Cloudinary niefrrkx ---');
  const rawNie = await cloudinary.api.resources({ type: 'upload', resource_type: 'raw', prefix: 'ips-education/assets/Documents', max_results: 50 });
  console.log('Raw resources in niefrrkx:', rawNie.resources.length);
  rawNie.resources.forEach(r => console.log('  ', r.public_id, r.secure_url));

  const imgNie = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix: 'ips-education/assets/Documents', max_results: 50 });
  console.log('Image resources in niefrrkx:', imgNie.resources.length);
  imgNie.resources.forEach(r => console.log('  ', r.public_id, r.secure_url));

  console.log('\n--- Checking Cloudinary dnw7mgysa ---');
  cloudinary.config({
    cloud_name: 'dnw7mgysa',
    api_key: '727794366589874',
    api_secret: 'oIZ3h6dnPsNzqW5UZiMhRn_7vlQ'
  });
  const rawDnw = await cloudinary.api.resources({ type: 'upload', resource_type: 'raw', prefix: 'ips-education/assets/Documents', max_results: 50 });
  console.log('Raw resources in dnw7mgysa:', rawDnw.resources.length);
  rawDnw.resources.forEach(r => console.log('  ', r.public_id, r.secure_url));

  mongoose.disconnect();
}

run();
