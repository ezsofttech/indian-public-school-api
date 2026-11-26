require('dotenv/config');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Types } = mongoose;

const mongoUri =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-public-school';

const rootDir = process.cwd();
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

function getMatchQueryFn(colName) {
  switch (colName) {
    case 'users':
      return (doc, mongoId) => (doc.email ? { email: doc.email } : mongoId ? { _id: mongoId } : { username: doc.username });
    case 'staff':
      return (doc, mongoId) => (doc.staffId ? { staffId: doc.staffId } : doc.email ? { email: doc.email } : mongoId ? { _id: mongoId } : { name: doc.name });
    case 'students':
      return (doc, mongoId) => (doc.studentId ? { studentId: doc.studentId } : doc.admissionNo ? { admissionNo: doc.admissionNo } : mongoId ? { _id: mongoId } : { name: doc.name });
    case 'galleries':
      return (doc, mongoId) => (doc.publicId ? { publicId: doc.publicId } : doc.slug ? { slug: doc.slug } : mongoId ? { _id: mongoId } : { title: doc.title });
    case 'menuitems':
      return (doc, mongoId) => (doc.menuId ? { menuId: doc.menuId } : mongoId ? { _id: mongoId } : { title: doc.title });
    case 'news':
      return (doc, mongoId) => (doc.publicId ? { publicId: doc.publicId } : mongoId ? { _id: mongoId } : { title: doc.title });
    case 'reviews':
      return (doc, mongoId) => (doc.publicId ? { publicId: doc.publicId } : mongoId ? { _id: mongoId } : { reviewerName: doc.reviewerName });
    case 'pages':
      return (doc, mongoId) => (doc.slug ? { slug: doc.slug } : mongoId ? { _id: mongoId } : { title: doc.title });
    case 'careerposts':
      return (doc, mongoId) => (doc.slug ? { slug: doc.slug } : mongoId ? { _id: mongoId } : { title: doc.title });
    case 'careerapplications':
      return (doc, mongoId) => (doc.email ? { email: doc.email } : mongoId ? { _id: mongoId } : { applicantName: doc.applicantName });
    case 'inquiries':
      return (doc, mongoId) => (doc.email ? { email: doc.email, phone: doc.phone } : mongoId ? { _id: mongoId } : { name: doc.name });
    case 'themes':
      return (doc, mongoId) => (doc.slug ? { slug: doc.slug } : mongoId ? { _id: mongoId } : { name: doc.name });
    default:
      return (doc, mongoId) => (mongoId ? { _id: mongoId } : doc.slug ? { slug: doc.slug } : doc.title ? { title: doc.title } : { ...doc });
  }
}

async function restoreCollection(database, collectionName, docs, matchQueryFn) {
  if (!Array.isArray(docs) || docs.length === 0) {
    return 0;
  }

  const collection = database.collection(collectionName);

  if (collectionName === 'menuitems') {
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
  if (!fs.existsSync(collectionsDir)) {
    console.error(`[db:restore] Error: Collections directory not found at ${collectionsDir}`);
    process.exit(1);
  }

  console.log('Connecting to database:', mongoUri.replace(/\/\/.*@/, '//<credentials>@'));
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  console.log('Connected to MongoDB successfully.');

  const files = fs.readdirSync(collectionsDir).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} collection JSON files in ${collectionsDir}.`);

  const summary = {};

  for (const file of files) {
    const colName = path.basename(file, '.json');
    const filePath = path.join(collectionsDir, file);

    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (colName === 'schoolsettings') {
        const settingsCol = database.collection('schoolsettings');
        const siteLogo = content.site_logo || content.home?.[0]?.identity?.site_logo;

        await settingsCol.updateOne(
          { key: 'site_datasource' },
          {
            $set: {
              key: 'site_datasource',
              category: 'Content',
              value: content,
              description: 'Public Indian Public School website datasource',
              status: 'Active',
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );

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
            { upsert: true }
          );
        }
        summary['schoolsettings'] = 'Restored site_datasource & site_logo';
      } else if (Array.isArray(content) && content.length > 0) {
        const restored = await restoreCollection(
          database,
          colName,
          content,
          getMatchQueryFn(colName)
        );
        summary[colName] = `${restored} items restored`;
      }
    } catch (err) {
      console.warn(`[db:restore] Warning restoring ${file}:`, err.message);
      summary[colName] = `Error: ${err.message}`;
    }
  }

  console.log('\n[db:restore] Database Restore Completed Successfully:');
  console.table(summary);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[db:restore] Fatal Error:', err);
  process.exit(1);
});
