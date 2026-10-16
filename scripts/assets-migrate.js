require('dotenv/config');

const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('[assets:migrate] Error: Missing Cloudinary credentials in .env');
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const root = process.cwd();
const assetsDir = path.join(root, 'public', 'assets');
const cloudDatasourcePath = path.join(root, 'public', 'cloud-datasource.json');
const nextDatasourcePath = path.resolve(root, '../../next-app/indian-public-school-app/public/cloud-datasource.json');

const rootFolder = (process.env.CLOUDINARY_ROOT_FOLDER || 'ips-education/assets').replace(/^\/+|\/+$/g, '');

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

function getResourceType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.avi'].includes(ext)) return 'video';
  return 'raw';
}

function uploadToCloudinary(filePath, relativePath) {
  const resourceType = getResourceType(filePath);
  const dirName = path.dirname(relativePath).replace(/\\/g, '/');
  const targetFolder = dirName === '.' ? rootFolder : `${rootFolder}/${dirName}`;
  const isRaw = resourceType === 'raw';
  const publicId = isRaw
    ? path.basename(relativePath)
    : path.basename(relativePath, path.extname(relativePath));

  const options = {
    folder: targetFolder,
    public_id: publicId,
    resource_type: resourceType,
    overwrite: true,
    invalidate: true,
  };

  const stat = fs.statSync(filePath);

  return new Promise((resolve, reject) => {
    const onComplete = (err, result) => {
      if (err) return reject(err);
      if (!result?.secure_url) return reject(new Error(`No secure_url returned for ${relativePath}`));
      resolve(result.secure_url);
    };

    if (stat.size > 10 * 1024 * 1024) {
      cloudinary.uploader.upload_large(
        filePath,
        {
          ...options,
          chunk_size: 6 * 1024 * 1024,
        },
        onComplete,
      );
    } else {
      const stream = cloudinary.uploader.upload_stream(options, onComplete);
      fs.createReadStream(filePath).pipe(stream);
    }
  });
}

async function runQueue(tasks, concurrency = 5) {
  let index = 0;
  const results = [];

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function replaceAssetUrls(obj, urlMap) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceAssetUrls(item, urlMap));
  }

  const res = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      let updatedVal = val;
      for (const [localRef, cloudUrl] of urlMap.entries()) {
        if (updatedVal === localRef || updatedVal === `/${localRef}`) {
          updatedVal = cloudUrl;
          break;
        }
      }
      res[key] = updatedVal;
    } else if (typeof val === 'object') {
      res[key] = replaceAssetUrls(val, urlMap);
    } else {
      res[key] = val;
    }
  }
  return res;
}

async function main() {
  console.log('=== [assets:migrate] Starting Unified Cloudinary Asset Migration ===');
  console.log(`Cloud Name: ${cloudName} | Destination Folder: ${rootFolder}`);
  console.log(`Scanning local assets directory: ${assetsDir}`);

  if (!fs.existsSync(assetsDir)) {
    console.error(`[assets:migrate] Directory not found: ${assetsDir}`);
    process.exit(1);
  }

  const files = collectFiles(assetsDir).filter(
    (f) => !f.endsWith('.DS_Store') && path.basename(f) !== 'datasource.json',
  );

  console.log(`Discovered ${files.length} local assets to migrate.`);

  const urlMap = new Map();
  let uploadedCount = 0;
  let failedCount = 0;

  const tasks = files.map((filePath, i) => async () => {
    const relativePath = path.relative(assetsDir, filePath).replace(/\\/g, '/');
    try {
      const cloudUrl = await uploadToCloudinary(filePath, relativePath);
      urlMap.set(`assets/${relativePath}`, cloudUrl);
      urlMap.set(`/assets/${relativePath}`, cloudUrl);
      uploadedCount++;
      if (uploadedCount % 10 === 0 || uploadedCount === files.length) {
        console.log(`Progress: Uploaded ${uploadedCount}/${files.length} assets...`);
      }
    } catch (err) {
      failedCount++;
      console.warn(`[assets:migrate] Warning: Failed to upload ${relativePath}: ${err.message}`);
    }
  });

  await runQueue(tasks, 5);

  // Update cloud-datasource.json with Cloudinary URLs
  if (fs.existsSync(cloudDatasourcePath)) {
    try {
      const datasource = JSON.parse(fs.readFileSync(cloudDatasourcePath, 'utf8'));
      const updatedDatasource = replaceAssetUrls(datasource, urlMap);
      fs.writeFileSync(cloudDatasourcePath, JSON.stringify(updatedDatasource, null, 2), 'utf8');
      console.log(`[assets:migrate] Updated asset URLs in: ${cloudDatasourcePath}`);

      if (fs.existsSync(path.dirname(nextDatasourcePath))) {
        fs.writeFileSync(nextDatasourcePath, JSON.stringify(updatedDatasource, null, 2), 'utf8');
        console.log(`[assets:migrate] Synced updated datasource to: ${nextDatasourcePath}`);
      }
    } catch (err) {
      console.warn(`[assets:migrate] Warning updating datasource: ${err.message}`);
    }
  }

  console.log('\n[assets:migrate] Migration Completed:');
  console.table({
    totalLocalAssets: files.length,
    uploaded: uploadedCount,
    failed: failedCount,
    destinationFolder: rootFolder,
  });
}

main().catch((err) => {
  console.error('[assets:migrate] Fatal Error:', err);
  process.exit(1);
});
