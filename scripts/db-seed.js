require('dotenv/config');

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const mongoUri =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-public-school';

const rootDir = process.cwd();
const datasourcePath = path.join(rootDir, 'public', 'cloud-datasource.json');
const menuitemsPath = path.join(rootDir, 'public', 'collections', 'menuitems.json');

const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin.ips@gmail.com';
const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@Ips';

const defaultMenuItems = [
  { menuId: 'home', title: 'Home', targetUrl: '/', icon: 'Home', order: 1, level: 1 },
  { menuId: 'about-us', title: 'About Us', targetUrl: '/about', icon: 'Building', order: 2, level: 1 },
  { menuId: 'academics', title: 'Academics', targetUrl: '/academic/courses-offered', icon: 'BookOpen', order: 3, level: 1 },
  { menuId: 'admissions', title: 'Admissions', targetUrl: '/admissions/policy', icon: 'FileText', order: 4, level: 1 },
  { menuId: 'infrastructure', title: 'Infrastructure', targetUrl: '/infrastructure', icon: 'Trees', order: 5, level: 1 },
  { menuId: 'press-release', title: 'Media & News', targetUrl: '/press-release', icon: 'Newspaper', order: 6, level: 1 },
  { menuId: 'careers', title: 'Careers', targetUrl: '/careers', icon: 'Briefcase', order: 7, level: 1 },
  { menuId: 'contact-us', title: 'Contact Us', targetUrl: '/contact-us', icon: 'Phone', order: 8, level: 1 },
];

const defaultLogoSetting = {
  logoUrl: 'https://res.cloudinary.com/dnw7mgysa/image/upload/ips-education/assets/Settings/Logos/IPSLogo.png',
  secondaryLogoUrl: 'https://res.cloudinary.com/dnw7mgysa/image/upload/ips-education/assets/Settings/Logos/AakashFoundationLogo.png',
  showSecondaryLogo: true,
  logoText: 'INDIAN PUBLIC SCHOOL',
  logoSubText: 'AFFILIATED TO CBSE, NEW DELHI',
};

function generatePublicId(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

const initialSampleNews = [
  {
    publicId: generatePublicId('NEW'),
    title: 'Admissions Open for Academic Session 2026–27',
    redirectUrl: '/admissions/policy',
    isPublished: true,
    createdAt: new Date(),
  },
  {
    publicId: generatePublicId('NEW') + '-2',
    title: 'Annual Sports Meet & Athletic Championship Concluded with Grandeur',
    redirectUrl: '/gallery-album',
    isPublished: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    publicId: generatePublicId('NEW') + '-3',
    title: 'Outstanding Performance by IPS Students in CBSE Board Examinations',
    redirectUrl: '/about',
    isPublished: true,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
];

const initialSampleReviews = [
  {
    publicId: generatePublicId('REV'),
    reviewerName: 'Dr. Rajesh Sharma',
    reviewerRole: 'Parent of Class 8 Student',
    rating: 5,
    reviewText: 'Indian Public School provides a remarkable blend of rigorous academics and holistic extracurricular development. The teachers are genuinely dedicated to every child’s growth.',
    isApproved: true,
    createdAt: new Date(),
  },
  {
    publicId: generatePublicId('REV') + '-2',
    reviewerName: 'Meenakshi Iyer',
    reviewerRole: 'Parent of Class 5 Student',
    rating: 5,
    reviewText: 'The campus infrastructure, smart classrooms, and sports facilities are outstanding. My daughter loves going to school every single day.',
    isApproved: true,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
];

async function main() {
  console.log('=== [db:seed] Starting Initial Database Seeding ===');
  console.log('Connecting to database:', mongoUri.replace(/\/\/.*@/, '//<credentials>@'));
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  console.log('Connected to MongoDB successfully.');

  // 1. Seed Super Admin User (preserves user's exact auth credentials)
  const usersCol = database.collection('users');
  const existingUser = await usersCol.findOne({ email: adminEmail.toLowerCase().trim() });
  if (!existingUser) {
    await usersCol.insertOne({
      _id: new mongoose.Types.ObjectId('6aa8aac2d8e8f8ffe666eded'),
      email: 'admin.ips@gmail.com',
      allowedModules: ['*'],
      createdAt: new Date('2026-09-15T02:17:38.268Z'),
      lastLoginAt: new Date('2026-10-14T06:25:30.197Z'),
      name: 'Super Admin',
      parentId: null,
      passwordHash: '$2b$10$3PYdDsgoPtbrj3PcmPWQde0/4MZ/mjOxzWn9IXDyUCEp.ycdi5xie',
      publicId: 'USR-MU21KPGC-73J3N',
      role: 'Super Admin',
      status: 'ACTIVE',
      updatedAt: new Date('2026-10-14T09:52:41.892Z'),
    });
    console.log(`[db:seed] Admin User Seeded: ${adminEmail}`);
  } else {
    console.log(
      `[db:seed] Admin User Auth Preserved: ${adminEmail} (${existingUser.publicId || 'USR-MU21KPGC-73J3N'})`,
    );
  }

  // 2. Seed site_logo setting
  const settingsCol = database.collection('schoolsettings');
  await settingsCol.updateOne(
    { key: 'site_logo' },
    {
      $set: {
        key: 'site_logo',
        category: 'Branding',
        value: defaultLogoSetting,
        description: 'Official School Header and Footer Logo branding setting',
        status: 'Active',
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  console.log('[db:seed] School Branding (site_logo) Seeded.');

  // 3. Seed site_datasource from cloud-datasource.json if exists
  if (fs.existsSync(datasourcePath)) {
    try {
      const datasource = JSON.parse(fs.readFileSync(datasourcePath, 'utf8'));
      await settingsCol.updateOne(
        { key: 'site_datasource' },
        {
          $set: {
            key: 'site_datasource',
            category: 'Content',
            value: datasource,
            description: 'Public Indian Public School website datasource',
            status: 'Active',
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      console.log('[db:seed] Core Site Datasource Seeded.');
    } catch (err) {
      console.warn('[db:seed] Warning loading datasource:', err.message);
    }
  }

  // 4. Seed Core Menu Items (preserves canonical _id to maintain 3-level hierarchy)
  const menuCol = database.collection('menuitems');
  let itemsToSeed = defaultMenuItems;
  if (fs.existsSync(menuitemsPath)) {
    try {
      const fileItems = JSON.parse(fs.readFileSync(menuitemsPath, 'utf8'));
      if (Array.isArray(fileItems) && fileItems.length > 0) {
        itemsToSeed = fileItems;
      }
    } catch {}
  }

  // Clear and insert with canonical _ids and parentIds to prevent broken hierarchy
  await menuCol.deleteMany({});
  const menuDocsToInsert = itemsToSeed.map((item) => {
    const copy = { ...item };
    const mongoId = item._id && mongoose.Types.ObjectId.isValid(String(item._id))
      ? new mongoose.Types.ObjectId(String(item._id))
      : undefined;
    delete copy._id;
    if (copy.__v !== undefined) delete copy.__v;
    if (copy.parentId && mongoose.Types.ObjectId.isValid(String(copy.parentId))) {
      copy.parentId = new mongoose.Types.ObjectId(String(copy.parentId));
    } else {
      copy.parentId = null;
    }
    if (copy.createdAt) copy.createdAt = new Date(copy.createdAt);
    if (copy.updatedAt) copy.updatedAt = new Date(copy.updatedAt);
    return {
      ...(mongoId ? { _id: mongoId } : {}),
      ...copy,
      category: copy.category || 'Header',
      isPublished: copy.isPublished !== false,
    };
  });
  await menuCol.insertMany(menuDocsToInsert);
  console.log(`[db:seed] Seeded ${menuDocsToInsert.length} Menu Items with 3-level hierarchy.`);

  // 5. Seed sample News if collection is empty
  const newsCol = database.collection('news');
  const newsCount = await newsCol.countDocuments({});
  if (newsCount === 0) {
    await newsCol.insertMany(initialSampleNews);
    console.log(`[db:seed] Seeded ${initialSampleNews.length} initial news announcements.`);
  }

  // 6. Seed sample Reviews if collection is empty
  const reviewsCol = database.collection('reviews');
  const reviewsCount = await reviewsCol.countDocuments({});
  if (reviewsCount === 0) {
    await reviewsCol.insertMany(initialSampleReviews);
    console.log(`[db:seed] Seeded ${initialSampleReviews.length} initial testimonials/reviews.`);
  }

  console.log('\n========================================');
  console.log('   IPS Database Initial Seeding Done!   ');
  console.log('========================================');
  console.log('Admin Console Login Credentials:');
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
  console.log('  URL:      http://localhost:3000/admin/login');
  console.log('========================================\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[db:seed] Fatal Error:', err);
  process.exit(1);
});
