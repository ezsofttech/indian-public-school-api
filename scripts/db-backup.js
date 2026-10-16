require('dotenv/config');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const mongoUri =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-public-school';

const rootDir = process.cwd();
const datasourcePath = path.join(rootDir, 'public', 'cloud-datasource.json');
const collectionsDir = path.join(rootDir, 'public', 'collections');

const nextAppPublicPath = path.resolve(
  rootDir,
  '../../next-app/indian-public-school-app/public',
);

function formatDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const copy = { ...doc };
  if (copy._id) copy._id = String(copy._id);
  if (copy.parentId) copy.parentId = String(copy.parentId);
  if (copy.__v !== undefined) delete copy.__v;
  if (copy.passwordHash) delete copy.passwordHash;
  if (copy.password) delete copy.password;
  return copy;
}

function formatCollection(docs) {
  return (Array.isArray(docs) ? docs : []).map(formatDocument);
}

const NON_FRONTEND_KEYS = [
  'users',
  'staff',
  'students',
  'inquiries',
  'careerposts',
  'galleries',
  'notices',
  'schoolsettings',
];

const UNUSED_COLLECTION_FILES = [
  'users.json',
  'staff.json',
  'students.json',
  'inquiries.json',
  'schoolsettings.json',
  'careerposts.json',
  'notices.json',
];

async function main() {
  console.log('=== [db:backup] Starting Database Backup ===');
  console.log('Connecting to database:', mongoUri.replace(/\/\/.*@/, '//<credentials>@'));
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  console.log('Connected to MongoDB successfully.');

  let existingDatasource = {};
  if (fs.existsSync(datasourcePath)) {
    try {
      existingDatasource = JSON.parse(fs.readFileSync(datasourcePath, 'utf8'));
    } catch {
      existingDatasource = {};
    }
  }

  console.log('Fetching collections from MongoDB...');
  const gallery = formatCollection(await database.collection('galleries').find({}).toArray());
  const menuitems = formatCollection(await database.collection('menuitems').find({}).toArray());
  const news = formatCollection(await database.collection('news').find({}).toArray());
  const reviews = formatCollection(await database.collection('reviews').find({}).toArray());
  const pages = formatCollection(await database.collection('pages').find({}).toArray());

  const siteSettingsDoc = await database.collection('schoolsettings').findOne({ key: 'site_datasource' });
  const siteLogoDoc = await database.collection('schoolsettings').findOne({ key: 'site_logo' });

  let updatedDatasource =
    siteSettingsDoc?.value && typeof siteSettingsDoc.value === 'object'
      ? { ...siteSettingsDoc.value }
      : { ...existingDatasource };

  // Remove non-frontend keys from datasource
  for (const k of NON_FRONTEND_KEYS) {
    delete updatedDatasource[k];
  }

  // Preserve & propagate site_logo if set in DB
  if (siteLogoDoc?.value && typeof siteLogoDoc.value === 'object') {
    updatedDatasource.site_logo = siteLogoDoc.value;
  }

  // Update canonical front-end collections (preserve existing if DB is empty)
  if (gallery.length > 0) updatedDatasource.gallery = gallery;
  if (menuitems.length > 0) updatedDatasource.menuitems = menuitems;
  if (news.length > 0) updatedDatasource.news = news;
  if (reviews.length > 0) updatedDatasource.reviews = reviews;
  if (pages.length > 0) updatedDatasource.pages = pages;

  // Clean obsolete fields from hero section if any
  if (Array.isArray(updatedDatasource.home)) {
    updatedDatasource.home.forEach((homeItem) => {
      if (homeItem?.hero?.content && Array.isArray(homeItem.hero.content)) {
        homeItem.hero.content = homeItem.hero.content.map((c) => {
          if (!c || typeof c !== 'object') return c;
          const { linksBtn, icoBtn, session, ...rest } = c;
          return rest;
        });
      }
    });
  }

  const jsonContent = JSON.stringify(updatedDatasource, null, 2);
  fs.writeFileSync(datasourcePath, jsonContent, 'utf8');

  // Save front-end collection files to public/collections/
  if (!fs.existsSync(collectionsDir)) {
    fs.mkdirSync(collectionsDir, { recursive: true });
  }

  // Clean up unused collection files
  for (const f of UNUSED_COLLECTION_FILES) {
    const p = path.join(collectionsDir, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }

  const collectionsMap = {
    galleries: gallery,
    menuitems,
    news,
    reviews,
    pages,
  };

  for (const [colName, docs] of Object.entries(collectionsMap)) {
    if (Array.isArray(docs) && docs.length > 0) {
      const filePath = path.join(collectionsDir, `${colName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
    }
  }

  // Sync to Next.js frontend public directory if available
  if (fs.existsSync(nextAppPublicPath)) {
    const nextDatasourcePath = path.join(nextAppPublicPath, 'cloud-datasource.json');
    fs.writeFileSync(nextDatasourcePath, jsonContent, 'utf8');

    const nextCollectionsDir = path.join(nextAppPublicPath, 'collections');
    if (!fs.existsSync(nextCollectionsDir)) {
      fs.mkdirSync(nextCollectionsDir, { recursive: true });
    }

    for (const f of UNUSED_COLLECTION_FILES) {
      const p = path.join(nextCollectionsDir, f);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }

    for (const [colName, docs] of Object.entries(collectionsMap)) {
      if (Array.isArray(docs) && docs.length > 0) {
        const filePath = path.join(nextCollectionsDir, `${colName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
      }
    }
    console.log(`Synced clean cloud-datasource.json & collections to next-app: ${nextAppPublicPath}`);
  }

  console.log('Database backup completed successfully (clean, front-end only):');
  console.table({
    galleries: collectionsMap.galleries.length || updatedDatasource.gallery?.length || 0,
    menuitems: collectionsMap.menuitems.length || updatedDatasource.menuitems?.length || 0,
    news: collectionsMap.news.length || updatedDatasource.news?.length || 0,
    reviews: collectionsMap.reviews.length || updatedDatasource.reviews?.length || 0,
    pages: collectionsMap.pages.length || updatedDatasource.pages?.length || 0,
    backupFile: 'public/cloud-datasource.json',
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[db:backup] Fatal Error:', err);
  process.exit(1);
});
