require('dotenv/config');

const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('[assets:backup] Error: Missing Cloudinary credentials in .env');
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const rootFolder = (process.env.CLOUDINARY_ROOT_FOLDER || 'ips-education/assets').replace(/^\/+|\/+$/g, '');
const localAssetsDir = path.join(process.cwd(), 'public', 'assets');

async function getAllCloudinaryResources(prefix) {
  const resources = [];
  let nextCursor = undefined;

  console.log(`[assets:backup] Fetching asset index from Cloudinary (prefix: ${prefix})...`);

  do {
    let query = cloudinary.search
      .expression(`folder:${prefix}/*`)
      .sort_by('public_id', 'asc')
      .max_results(500);

    if (nextCursor) {
      query = query.next_cursor(nextCursor);
    }

    const response = await query.execute();
    if (Array.isArray(response.resources)) {
      resources.push(...response.resources);
    }
    nextCursor = response.next_cursor;
  } while (nextCursor);

  return resources;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

function resolveRelativePath(resource, prefix) {
  let rel = resource.public_id;
  if (rel.startsWith(prefix + '/')) {
    rel = rel.slice(prefix.length + 1);
  } else if (rel.startsWith(prefix)) {
    rel = rel.slice(prefix.length);
  }

  const ext = path.extname(rel).toLowerCase();
  const format = (resource.format || '').toLowerCase();
  if (!ext && format) {
    rel += `.${format}`;
  }
  return rel;
}

function getDownloadUrl(resource) {
  if (resource.secure_url) return resource.secure_url;
  return cloudinary.url(resource.public_id, {
    resource_type: resource.resource_type || 'image',
    secure: true,
    format: resource.format,
  });
}

async function runQueue(tasks, concurrency = 6) {
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

async function main() {
  console.log('=== [assets:backup] Starting Cloudinary Asset Backup ===');
  console.log(`Cloud Name: ${cloudName} | Target Folder: ${rootFolder}`);
  console.log(`Local Destination: ${localAssetsDir}`);

  if (!fs.existsSync(localAssetsDir)) {
    fs.mkdirSync(localAssetsDir, { recursive: true });
  }

  const resources = await getAllCloudinaryResources(rootFolder);
  console.log(`Discovered ${resources.length} assets on Cloudinary.`);

  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const tasks = resources.map((resource, i) => async () => {
    const relPath = resolveRelativePath(resource, rootFolder);
    const destPath = path.join(localAssetsDir, relPath);
    const dir = path.dirname(destPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Incremental: Skip if file already exists with identical size
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (resource.bytes && stat.size === resource.bytes) {
        skippedCount++;
        return;
      }
    }

    try {
      const downloadUrl = getDownloadUrl(resource);
      await downloadFile(downloadUrl, destPath);
      downloadedCount++;
      if (downloadedCount % 20 === 0 || downloadedCount === resources.length) {
        console.log(`Progress: Downloaded ${downloadedCount}/${resources.length} assets...`);
      }
    } catch (err) {
      failedCount++;
      console.warn(`[assets:backup] Warning: Failed to download ${relPath}: ${err.message}`);
    }
  });

  await runQueue(tasks, 8);

  console.log('\n[assets:backup] Backup Completed:');
  console.table({
    totalCloudinaryAssets: resources.length,
    downloaded: downloadedCount,
    alreadyUpToDate: skippedCount,
    failed: failedCount,
    assetsDirectory: 'public/assets',
  });
}

main().catch((err) => {
  console.error('[assets:backup] Fatal Error:', err);
  process.exit(1);
});
