require('dotenv/config');

const readline = require('readline');
const { v2: cloudinary } = require('cloudinary');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('[root:cleanup] Error: Missing Cloudinary credentials in .env');
  console.error('Please ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.');
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npm run root:cleanup [options]

Options:
  --dry-run, -d        Preview files/folders to be deleted without deleting
  -y, --force, --yes   Skip interactive confirmation prompt
  --all, --full        Purge all root-level folders & resources in Cloudinary
  -f, --folder <name>  Specify a target root folder to clean (e.g. -f samples)
  --only-home          Only delete assets directly under Home (root) without touching subfolders
  -h, --help           Display this help guide
`);
  process.exit(0);
}

const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isForce = args.includes('--force') || args.includes('-y') || args.includes('--yes');
const isWipeAll = args.includes('--all') || args.includes('--full');
const isOnlyHome = args.includes('--only-home');

const folderArgIndex = args.findIndex((arg) => arg === '--folder' || arg === '-f' || arg === '--target');
const customFolder = folderArgIndex !== -1 && args[folderArgIndex + 1] ? args[folderArgIndex + 1] : null;

// Target folder: defaults to 'samples' if not specified and not --all
const targetFolder = isWipeAll ? null : (customFolder || 'samples').replace(/^\/+|\/+$/g, '');

const RESOURCE_TYPES = ['image', 'video', 'raw'];

/**
 * Prompt terminal user for confirmation
 */
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Fetch all subfolders recursively under a given parent folder
 */
async function getAllSubFolders(parentFolder) {
  const subfolders = [];
  let nextCursor = undefined;

  try {
    do {
      const res = await cloudinary.api.sub_folders(parentFolder, {
        max_results: 100,
        next_cursor: nextCursor,
      });

      if (res && Array.isArray(res.folders)) {
        for (const folder of res.folders) {
          subfolders.push(folder.path);
          const deeper = await getAllSubFolders(folder.path);
          subfolders.push(...deeper);
        }
      }
      nextCursor = res ? res.next_cursor : undefined;
    } while (nextCursor);
  } catch (err) {
    // Folder may not exist or may have no subfolders
  }

  return subfolders;
}

/**
 * List all root-level folders
 */
async function getRootFolders() {
  const rootFolders = [];
  let nextCursor = undefined;

  try {
    do {
      const res = await cloudinary.api.root_folders({
        max_results: 100,
        next_cursor: nextCursor,
      });

      if (res && Array.isArray(res.folders)) {
        for (const folder of res.folders) {
          rootFolders.push(folder.name || folder.path);
        }
      }
      nextCursor = res ? res.next_cursor : undefined;
    } while (nextCursor);
  } catch (err) {
    console.warn(`[root:cleanup] Warning fetching root folders: ${err.message}`);
  }

  return rootFolders;
}

/**
 * Fetch resources for a prefix across image, video, and raw
 */
async function listResourcesByPrefix(prefix) {
  const result = {
    image: [],
    video: [],
    raw: [],
  };

  for (const resType of RESOURCE_TYPES) {
    let nextCursor = undefined;
    do {
      try {
        const queryOptions = {
          type: 'upload',
          resource_type: resType,
          max_results: 500,
          next_cursor: nextCursor,
        };
        if (prefix) {
          queryOptions.prefix = prefix;
        }

        const response = await cloudinary.api.resources(queryOptions);

        if (Array.isArray(response.resources)) {
          result[resType].push(...response.resources);
        }
        nextCursor = response.next_cursor;
      } catch (err) {
        break;
      }
    } while (nextCursor);
  }

  return result;
}

/**
 * Fetch all assets located directly at root "Home" (no folder in public_id)
 */
async function getHomeRootAssets() {
  const result = {
    image: [],
    video: [],
    raw: [],
  };

  for (const resType of RESOURCE_TYPES) {
    let nextCursor = undefined;
    do {
      try {
        const response = await cloudinary.api.resources({
          type: 'upload',
          resource_type: resType,
          max_results: 500,
          next_cursor: nextCursor,
        });

        if (Array.isArray(response.resources)) {
          // Assets in "Home" do NOT have any folder slash '/' in their public_id
          const rootOnly = response.resources.filter((r) => !r.public_id.includes('/'));
          result[resType].push(...rootOnly);
        }
        nextCursor = response.next_cursor;
      } catch (err) {
        break;
      }
    } while (nextCursor);
  }

  return result;
}

/**
 * Delete resources by public ID in chunks of 100
 */
async function deleteResourcesByPublicIds(publicIds, resourceType = 'image') {
  let totalDeleted = 0;
  const chunkSize = 100;

  for (let i = 0; i < publicIds.length; i += chunkSize) {
    const chunk = publicIds.slice(i, i + chunkSize);
    try {
      const res = await cloudinary.api.delete_resources(chunk, {
        resource_type: resourceType,
        invalidate: true,
      });

      if (res && res.deleted) {
        const count = Object.keys(res.deleted).filter((k) => res.deleted[k] === 'deleted').length;
        totalDeleted += count;
      }
    } catch (err) {
      console.warn(`[root:cleanup] Warning deleting ${resourceType} batch: ${err.message}`);
    }
  }

  return totalDeleted;
}

/**
 * Delete resources in batches by prefix for a given resource_type
 */
async function deleteResourcesByPrefix(prefix, resourceType) {
  let totalDeleted = 0;
  let nextCursor = undefined;

  do {
    try {
      const options = {
        resource_type: resourceType,
        invalidate: true,
        next_cursor: nextCursor,
      };

      const res = prefix
        ? await cloudinary.api.delete_resources_by_prefix(prefix, options)
        : await cloudinary.api.delete_all_resources(options);

      if (res && res.deleted) {
        const deletedKeys = Object.keys(res.deleted);
        const deletedCount = deletedKeys.filter((k) => res.deleted[k] === 'deleted').length;
        totalDeleted += deletedCount;
      }

      nextCursor = res ? res.next_cursor : undefined;
    } catch (err) {
      console.warn(`[root:cleanup] Warning deleting ${resourceType} resources: ${err.message}`);
      break;
    }
  } while (nextCursor);

  return totalDeleted;
}

async function main() {
  console.log('===============================================================');
  console.log('      Cloudinary Home / Root Asset & Folder Cleanup Tool       ');
  console.log('===============================================================');
  console.log(`Cloud Name    : ${cloudName}`);
  console.log(`Mode          : ${isDryRun ? 'DRY RUN (Preview Only)' : 'LIVE EXECUTION'}`);
  console.log(`Scope         : ${isWipeAll ? 'FULL ROOT PURGE (--all)' : isOnlyHome ? 'HOME ASSETS ONLY' : `Target: "${targetFolder}" + Home Root Assets`}`);
  console.log('---------------------------------------------------------------\n');

  let foldersToDelete = [];
  const assetsToDelete = {
    folderAssets: { image: [], video: [], raw: [] },
    homeAssets: { image: [], video: [], raw: [] },
  };

  if (isWipeAll) {
    console.log('[root:cleanup] Discovering all root folders...');
    const roots = await getRootFolders();
    for (const root of roots) {
      const subs = await getAllSubFolders(root);
      foldersToDelete.push(...subs, root);
    }
    console.log(`Found ${roots.length} root folder(s) and ${foldersToDelete.length} total folder(s).`);

    console.log('[root:cleanup] Scanning all resources in account...');
    assetsToDelete.folderAssets = await listResourcesByPrefix(null);
  } else {
    // 1. Scan for assets located directly in Home root
    console.log('[root:cleanup] Scanning for loose assets directly under "Home" (root)...');
    assetsToDelete.homeAssets = await getHomeRootAssets();

    // 2. Scan target folder if not --only-home
    if (!isOnlyHome && targetFolder) {
      console.log(`[root:cleanup] Checking for folder "${targetFolder}" and its subfolders...`);
      const subFolders = await getAllSubFolders(targetFolder);
      if (subFolders.length > 0) {
        foldersToDelete.push(...subFolders);
      }
      foldersToDelete.push(targetFolder);

      console.log(`[root:cleanup] Scanning assets inside folder "${targetFolder}"...`);
      assetsToDelete.folderAssets = await listResourcesByPrefix(targetFolder);
    }
  }

  const homeImageCount = assetsToDelete.homeAssets.image.length;
  const homeVideoCount = assetsToDelete.homeAssets.video.length;
  const homeRawCount = assetsToDelete.homeAssets.raw.length;
  const totalHomeCount = homeImageCount + homeVideoCount + homeRawCount;

  const folderImageCount = assetsToDelete.folderAssets.image.length;
  const folderVideoCount = assetsToDelete.folderAssets.video.length;
  const folderRawCount = assetsToDelete.folderAssets.raw.length;
  const totalFolderCount = folderImageCount + folderVideoCount + folderRawCount;

  const grandTotalAssets = totalHomeCount + totalFolderCount;

  console.log('\nFound Assets Summary:');
  console.table({
    'Home Root Assets': totalHomeCount,
    'Folder Assets': totalFolderCount,
    'Total Assets': grandTotalAssets,
    'Folders to Remove': foldersToDelete.length,
  });

  if (totalHomeCount > 0) {
    console.log('\nAssets located directly in "Home":');
    [...assetsToDelete.homeAssets.image, ...assetsToDelete.homeAssets.video, ...assetsToDelete.homeAssets.raw].forEach(
      (a) => console.log(`  🖼️  [${a.resource_type}] ${a.public_id} (${a.format || 'unknown'})`),
    );
  }

  if (foldersToDelete.length > 0) {
    console.log('\nFolders identified for cleanup:');
    foldersToDelete.forEach((f) => console.log(`  📁 ${f}`));
  }

  if (grandTotalAssets === 0 && foldersToDelete.length === 0) {
    console.log('\n[root:cleanup] No assets or folders found to clean. Everything is already spotless!');
    return;
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] Operation complete. No files or folders were deleted.');
    console.log('[DRY RUN] Run "npm run root:cleanup" (or add "-y" to bypass prompt) to delete them.');
    return;
  }

  // Safety confirmation prompt
  if (!isForce) {
    console.log('\n' + '!'.repeat(65));
    console.log(' ⚠️  CONFIRMATION REQUIRED:');
    console.log(` You are about to PERMANENTLY DELETE:`);
    if (totalHomeCount > 0) console.log(`   - ${totalHomeCount} asset(s) directly under "Home"`);
    if (totalFolderCount > 0) console.log(`   - ${totalFolderCount} asset(s) under folder "${targetFolder}"`);
    if (foldersToDelete.length > 0) console.log(`   - ${foldersToDelete.length} folder(s)`);
    if (isWipeAll) console.log('   - WARNING: --all will wipe your entire Cloudinary storage!');
    console.log(' This action cannot be undone.');
    console.log('!'.repeat(65) + '\n');

    const expectedAnswer = isWipeAll ? 'wipe-all' : 'yes';
    const answer = await askConfirmation(`Type "${expectedAnswer}" to proceed with permanent deletion: `);

    if (answer !== expectedAnswer) {
      console.log('\n[root:cleanup] Cleanup cancelled by user. Nothing was deleted.');
      process.exit(0);
    }
  }

  // 1. Delete Home Root Assets
  let deletedHomeCount = 0;
  if (totalHomeCount > 0) {
    console.log('\n[root:cleanup] Deleting assets located directly under "Home"...');
    for (const resType of RESOURCE_TYPES) {
      const ids = assetsToDelete.homeAssets[resType].map((r) => r.public_id);
      if (ids.length > 0) {
        process.stdout.write(`Deleting ${ids.length} ${resType} root asset(s)... `);
        const count = await deleteResourcesByPublicIds(ids, resType);
        deletedHomeCount += count;
        console.log(`Done (${count} deleted).`);
      }
    }
  }

  // 2. Delete Folder Assets
  let deletedFolderCount = 0;
  if (totalFolderCount > 0) {
    console.log('\n[root:cleanup] Deleting assets inside folders...');
    for (const resType of RESOURCE_TYPES) {
      process.stdout.write(`Deleting ${resType} assets in "${targetFolder}"... `);
      const count = await deleteResourcesByPrefix(isWipeAll ? null : targetFolder, resType);
      deletedFolderCount += count;
      console.log(`Done (${count} deleted).`);
    }
  }

  // 3. Delete folders from deepest to root
  let foldersDeleted = 0;
  if (foldersToDelete.length > 0) {
    console.log('\n[root:cleanup] Deleting folders from deepest to root...');
    const sortedFolders = [...foldersToDelete].sort((a, b) => b.length - a.length);

    for (const folder of sortedFolders) {
      try {
        await cloudinary.api.delete_folder(folder);
        foldersDeleted++;
        console.log(`Deleted folder: ${folder}`);
      } catch (err) {
        // Folder might already be gone or empty
      }
    }
  }

  console.log('\n===============================================================');
  console.log('           Cleanup Completed Successfully!                     ');
  console.log('===============================================================');
  console.table({
    'Home Assets Deleted': deletedHomeCount,
    'Folder Assets Deleted': deletedFolderCount,
    'Total Assets Deleted': deletedHomeCount + deletedFolderCount,
    'Folders Deleted': foldersDeleted,
    'CDN Cache Invalidation': 'Requested (invalidate: true)',
  });
  console.log('\nCloudinary root is now clean.');
}

main().catch((err) => {
  console.error('\n[root:cleanup] Fatal Error:', err.message || err);
  process.exit(1);
});
