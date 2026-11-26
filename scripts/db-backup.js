require('dotenv/config');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load media utilities from TypeScript / build
let transformMediaPathsToFull = (d) => d;
let transformMediaUrlsToRelative = (d) => d;

try {
  require('ts-node/register');
  const mh = require('../src/uploads/utils/media-helper');
  if (mh.transformMediaPathsToFull) transformMediaPathsToFull = mh.transformMediaPathsToFull;
  if (mh.transformMediaUrlsToRelative) transformMediaUrlsToRelative = mh.transformMediaUrlsToRelative;
} catch (e) {
  try {
    const mh = require('../dist/uploads/utils/media-helper');
    if (mh.transformMediaPathsToFull) transformMediaPathsToFull = mh.transformMediaPathsToFull;
    if (mh.transformMediaUrlsToRelative) transformMediaUrlsToRelative = mh.transformMediaUrlsToRelative;
  } catch (err) {
    console.warn('[db:backup] Warning: Could not load media-helper utilities:', err.message);
  }
}

const mongoUri =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-public-school';

const rootDir = process.cwd();
const collectionsDir = path.join(rootDir, 'public', 'collections');
const backupDir = path.join(rootDir, 'backup');

const nextAppPublicPath = fs.existsSync(path.resolve(rootDir, '../indian-public-school-app/public'))
  ? path.resolve(rootDir, '../indian-public-school-app/public')
  : path.resolve(rootDir, '../../next-app/indian-public-school-app/public');

function formatDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const copy = { ...doc };
  if (copy._id) copy._id = String(copy._id);
  if (copy.parentId) copy.parentId = String(copy.parentId);
  if (copy.__v !== undefined) delete copy.__v;
  return copy;
}

function formatCollection(docs) {
  return (Array.isArray(docs) ? docs : []).map(formatDocument);
}

async function main() {
  console.log('=== [db:backup] Starting Database Backup (Pure MongoDB - Cloudinary excluded) ===');
  console.log('Connecting to database:', mongoUri.replace(/\/\/.*@/, '//<credentials>@'));
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  console.log('Connected to MongoDB successfully.');

  // Create destinations if needed
  if (!fs.existsSync(collectionsDir)) fs.mkdirSync(collectionsDir, { recursive: true });
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  console.log('Discovering and fetching all collections from MongoDB...');
  const allDbCollections = await database.listCollections().toArray();
  const collectionsMap = {};
  const summaryTable = {};

  for (const col of allDbCollections) {
    const colName = col.name;
    if (colName.startsWith('system.')) continue;

    const rawDocs = await database.collection(colName).find({}).toArray();
    const formatted = formatCollection(rawDocs);
    const sanitized = transformMediaUrlsToRelative(formatted);
    collectionsMap[colName] = sanitized;
    summaryTable[colName] = sanitized.length;

    // Backend carries all collections as sanitized relative paths
    const filePath = path.join(collectionsDir, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
  }

  // Handle clean schoolsettings (home layout & identity settings only)
  const siteSettingsDoc = await database.collection('schoolsettings').findOne({ key: 'site_datasource' });
  const siteLogoDoc = await database.collection('schoolsettings').findOne({ key: 'site_logo' });

  const rawSettings =
    siteSettingsDoc?.value && typeof siteSettingsDoc.value === 'object'
      ? { ...siteSettingsDoc.value }
      : {};

  const cleanSchoolSettings = {
    home: Array.isArray(rawSettings.home) ? rawSettings.home : [],
    header: rawSettings.header || {},
    footer: rawSettings.footer || {},
    whatsapp: rawSettings.whatsapp || {},
    popupBanner: rawSettings.popupBanner || {},
    site_logo: siteLogoDoc?.value || rawSettings.site_logo || {},
    certified_board: rawSettings.certified_board || {},
    trust_board: rawSettings.trust_board || {},
    academic_partner: rawSettings.academic_partner || {},
    developer: rawSettings.developer || {
      name: 'EZ Softech',
      url: 'https://ezsoftapp.in',
      label: 'Crafted by',
      showBackendStatus: true,
    },
  };

  // Clean obsolete fields from hero section
  if (Array.isArray(cleanSchoolSettings.home)) {
    cleanSchoolSettings.home.forEach((homeItem) => {
      if (homeItem?.hero?.content && Array.isArray(homeItem.hero.content)) {
        homeItem.hero.content = homeItem.hero.content.map((c) => {
          if (!c || typeof c !== 'object') return c;
          const { linksBtn, icoBtn, session, ...rest } = c;
          return rest;
        });
      }
      if (homeItem?.hero && Array.isArray(homeItem.hero.slides) && homeItem.hero.slides.length > 0) {
        delete homeItem.hero.fileUrls;
      }
    });
  }

  // Write schoolsettings.json (sanitized relative paths for backend)
  const cleanSchoolSettingsRelative = transformMediaUrlsToRelative(cleanSchoolSettings);
  fs.writeFileSync(
    path.join(collectionsDir, 'schoolsettings.json'),
    JSON.stringify(cleanSchoolSettingsRelative, null, 2),
    'utf8'
  );

  // Write full raw database dump to backup/db-backup.json (like amidbackend)
  fs.writeFileSync(
    path.join(backupDir, 'db-backup.json'),
    JSON.stringify(
      {
        version: 1,
        createdAt: new Date().toISOString(),
        collections: collectionsMap,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  // Frontend strictly carries only the 8 required public portal collections:
  const FRONTEND_PORTAL_COLLECTIONS = [
    'schoolsettings',
    'reviews',
    'publicdisclosuresections',
    'publicdisclosureconfigs',
    'pages',
    'news',
    'menuitems',
    'galleries',
  ];

  // Sync strictly required collections to Next.js frontend if available
  if (fs.existsSync(nextAppPublicPath)) {
    const nextCollectionsDir = path.join(nextAppPublicPath, 'collections');
    if (!fs.existsSync(nextCollectionsDir)) fs.mkdirSync(nextCollectionsDir, { recursive: true });

    // Clean non-frontend collections from Next.js app
    const existingFrontend = fs.readdirSync(nextCollectionsDir);
    for (const file of existingFrontend) {
      if (file.endsWith('.json')) {
        const base = file.replace(/\.json$/, '');
        if (!FRONTEND_PORTAL_COLLECTIONS.includes(base)) {
          fs.unlinkSync(path.join(nextCollectionsDir, file));
          console.log(`[db:backup] Cleaned non-portal collection from frontend: ${file}`);
        }
      }
    }

    // Write the 8 portal collections to Next.js app with full URLs wrapped according to current configuration
    for (const colName of FRONTEND_PORTAL_COLLECTIONS) {
      if (colName === 'schoolsettings') {
        const fullSchoolSettings = transformMediaPathsToFull(cleanSchoolSettings);
        fs.writeFileSync(
          path.join(nextCollectionsDir, 'schoolsettings.json'),
          JSON.stringify(fullSchoolSettings, null, 2),
          'utf8'
        );
        continue;
      }
      const docs = collectionsMap[colName] || [];
      const fullDocs = transformMediaPathsToFull(docs);
      fs.writeFileSync(
        path.join(nextCollectionsDir, `${colName}.json`),
        JSON.stringify(fullDocs, null, 2),
        'utf8'
      );
    }

    console.log(`Synced ${FRONTEND_PORTAL_COLLECTIONS.length} public portal collections to Next.js app: ${nextCollectionsDir}`);
  }

  console.log('\nDatabase backup completed successfully. Collections summary:');
  console.table(summaryTable);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[db:backup] Fatal Error:', err);
  process.exit(1);
});
