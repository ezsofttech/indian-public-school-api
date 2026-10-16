require('dotenv/config');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Types } = mongoose;

const mongoUri =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-public-school';

const rootDir = process.cwd();
const datasourcePath = path.join(rootDir, 'public', 'cloud-datasource.json');
const collectionsDir = path.join(rootDir, 'public', 'collections');

function toObjectId(idStr) {
  if (!idStr) return undefined;
  let raw = idStr;
  if (typeof idStr === 'object' && idStr !== null) {
    if (idStr.$oid && typeof idStr.$oid === 'string') {
      raw = idStr.$oid;
    } else if (idStr.toString && typeof idStr.toString === 'function') {
      raw = idStr.toString();
    }
  }
  const s = String(raw).trim();
  if (s && Types.ObjectId.isValid(s)) {
    return new Types.ObjectId(s);
  }
  return undefined;
}

function loadCollectionJson(name, fallbackList = []) {
  const filePath = path.join(collectionsDir, `${name}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }
  return Array.isArray(fallbackList) ? fallbackList : [];
}

async function restoreCollection(database, collectionName, docs, matchQueryFn) {
  if (!Array.isArray(docs) || docs.length === 0) {
    return 0;
  }

  const collection = database.collection(collectionName);

  if (collectionName === 'menuitems') {
    // For menuitems, the 3-level hierarchy depends on exact parentId -> _id relationships.
    // We clean the collection and restore with canonical _ids and parentIds to prevent broken hierarchy.
    await collection.deleteMany({});
    const docsToInsert = docs.map((doc) => {
      const copy = { ...doc };
      const mongoId = toObjectId(copy._id);
      delete copy._id;
      if (copy.__v !== undefined) delete copy.__v;
      if (copy.parentId) {
        const parentIdObj = toObjectId(copy.parentId);
        copy.parentId = parentIdObj || null;
      } else {
        copy.parentId = null;
      }
      if (copy.createdAt && typeof copy.createdAt === 'string') {
        copy.createdAt = new Date(copy.createdAt);
      }
      if (copy.updatedAt && typeof copy.updatedAt === 'string') {
        copy.updatedAt = new Date(copy.updatedAt);
      }
      return {
        ...(mongoId ? { _id: mongoId } : {}),
        ...copy,
      };
    });
    const res = await collection.insertMany(docsToInsert);
    return res.insertedCount;
  }

  let count = 0;

  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const copy = { ...doc };
    const mongoId = toObjectId(copy._id);
    delete copy._id;
    if (copy.__v !== undefined) delete copy.__v;

    if (copy.parentId) {
      const parentIdObj = toObjectId(copy.parentId);
      if (parentIdObj) copy.parentId = parentIdObj;
    }

    if (copy.createdAt && typeof copy.createdAt === 'string') {
      copy.createdAt = new Date(copy.createdAt);
    }
    if (copy.updatedAt && typeof copy.updatedAt === 'string') {
      copy.updatedAt = new Date(copy.updatedAt);
    }

    const query = matchQueryFn(doc, mongoId);
    const updatePayload = { $set: copy };
    if (mongoId) {
      updatePayload.$setOnInsert = { _id: mongoId };
    }

    const res = await collection.updateOne(query, updatePayload, { upsert: true });
    if (res.upsertedCount > 0 || res.modifiedCount > 0 || res.matchedCount > 0) {
      count++;
    }
  }
  return count;
}

async function main() {
  console.log('=== [db:restore] Starting Database Restore ===');
  if (!fs.existsSync(datasourcePath)) {
    console.error(`[db:restore] Error: Datasource file not found at ${datasourcePath}`);
    process.exit(1);
  }

  const datasource = JSON.parse(fs.readFileSync(datasourcePath, 'utf8'));
  console.log('Connecting to database:', mongoUri.replace(/\/\/.*@/, '//<credentials>@'));
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  console.log('Connected to MongoDB successfully.');

  // 1. Restore schoolsettings: site_datasource & site_logo
  const settingsCol = database.collection('schoolsettings');
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

  const siteLogo = datasource.site_logo || datasource.home?.[0]?.identity?.site_logo;
  if (siteLogo && typeof siteLogo === 'object' && siteLogo.logoUrl) {
    await settingsCol.updateOne(
      { key: 'site_logo' },
      {
        $set: {
          key: 'site_logo',
          category: 'Branding',
          value: siteLogo,
          description: 'Official School Header and Footer Logo branding setting',
          status: 'Active',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  }

  // 2. Load collections from public/collections or fallback to datasource
  const galleries = loadCollectionJson('galleries', datasource.gallery);
  const menuitems = loadCollectionJson('menuitems', datasource.menuitems);
  const news = loadCollectionJson('news', datasource.news);
  const reviews = loadCollectionJson('reviews', datasource.reviews);
  const pages = loadCollectionJson('pages', datasource.pages);

  // 3. Restore each collection using canonical unique business keys
  const restoredGalleries = await restoreCollection(
    database,
    'galleries',
    galleries,
    (doc) => (doc.publicId ? { publicId: doc.publicId } : doc.slug ? { slug: doc.slug } : { title: doc.title }),
  );

  const restoredMenuitems = await restoreCollection(
    database,
    'menuitems',
    menuitems,
    (doc) => (doc.menuId ? { menuId: doc.menuId } : { title: doc.title }),
  );

  const restoredNews = await restoreCollection(
    database,
    'news',
    news,
    (doc) => (doc.publicId ? { publicId: doc.publicId } : { title: doc.title }),
  );

  const restoredReviews = await restoreCollection(
    database,
    'reviews',
    reviews,
    (doc) => (doc.publicId ? { publicId: doc.publicId } : { reviewerName: doc.reviewerName }),
  );

  const restoredPages = await restoreCollection(
    database,
    'pages',
    pages,
    (doc) => (doc.slug ? { slug: doc.slug } : { title: doc.title }),
  );

  console.log('\n[db:restore] Database Restore Completed Successfully:');
  console.table({
    siteDatasource: 'Updated in schoolsettings',
    siteLogo: siteLogo ? 'Configured in schoolsettings' : 'Not set',
    galleries: restoredGalleries,
    menuitems: restoredMenuitems,
    news: restoredNews,
    reviews: restoredReviews,
    pages: restoredPages,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[db:restore] Fatal Error:', err);
  process.exit(1);
});
