require('dotenv/config');

const readline = require('readline');
const { v2: cloudinary } = require('cloudinary');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('[assets:cleanup] Error: Missing Cloudinary credentials in .env');
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
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isForce = args.includes('--force') || args.includes('-y') || args.includes('--yes');
const shouldKeepFolder = args.includes('--keep-folder');
const shouldCleanDb = args.includes('--clean-db');

const folderArgIndex = args.findIndex((arg) => arg === '--folder' || arg === '-f');
const customFolder = folderArgIndex !== -1 && args[folderArgIndex + 1] ? args[folderArgIndex + 1] : null;

const defaultRootFolder = (process.env.CLOUDINARY_ROOT_FOLDER || 'ips-education/assets').replace(/^\/+|\/+$/g, '');
const targetFolder = (customFolder || defaultRootFolder).replace(/^\/+|\/+$/g, '');

const RESOURCE_TYPES = ['image', 'video', 'raw'];

/**
 * Ask for interactive confirmation from terminal user
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
 * Fetch all resources under a prefix across image, video, and raw types
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
        const response = await cloudinary.api.resources({
          type: 'upload',
          prefix,
          resource_type: resType,
          max_results: 500,
          next_cursor: nextCursor,
        });

        if (Array.isArray(response.resources)) {
          result[resType].push(...response.resources);
        }
        nextCursor = response.next_cursor;
      } catch (err) {
        // If no resources or prefix not found, proceed
        break;
      }
    } while (nextCursor);
  }

  return result;
}

/**
 * Recursively fetch all subfolders under a given folder path
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
    // Parent folder might not exist or might not have subfolders
  }

  return subfolders;
}

/**
 * Delete resources in batches by prefix for a given resource_type
 */
async function deleteResourcesForType(prefix, resourceType) {
  let totalDeleted = 0;
  let nextCursor = undefined;

  do {
    try {
      const res = await cloudinary.api.delete_resources_by_prefix(prefix, {
        resource_type: resourceType,
        invalidate: true,
        next_cursor: nextCursor,
      });

      if (res && res.deleted) {
        const deletedKeys = Object.keys(res.deleted);
        const deletedCount = deletedKeys.filter((k) => res.deleted[k] === 'deleted').length;
        totalDeleted += deletedCount;
      }

      nextCursor = res ? res.next_cursor : undefined;
    } catch (err) {
      console.warn(`[assets:cleanup] Warning deleting ${resourceType} resources: ${err.message}`);
      break;
    }
  } while (nextCursor);

  return totalDeleted;
}

/**
 * Clean up MongoDB gallery records if --clean-db flag was provided
 */
async function cleanMongoDbGallery(folderPrefix) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-public-school';
  const mongoose = require('mongoose');

  console.log(`\n[assets:cleanup] Connecting to MongoDB to clean gallery records: ${mongoUri.replace(/\/\/.*@/, '//<credentials>@')}`);
  await mongoose.connect(mongoUri);

  try {
    const collection = mongoose.connection.db.collection('galleries');
    const filter = {
      $or: [
        { fileUrl: { $regex: new RegExp(`res\\.cloudinary\\.com.*${folderPrefix}`, 'i') } },
        { directory: { $regex: new RegExp(folderPrefix, 'i') } },
      ],
    };

    const countBefore = await collection.countDocuments(filter);
    console.log(`[assets:cleanup] Found ${countBefore} gallery records referencing "${folderPrefix}".`);

    if (countBefore > 0) {
      const deleteResult = await collection.deleteMany(filter);
      console.log(`[assets:cleanup] Removed ${deleteResult.deletedCount} gallery records from MongoDB.`);
    }
  } finally {
    await mongoose.disconnect();
    console.log('[assets:cleanup] MongoDB connection closed.');
  }
}

async function main() {
  console.log('===============================================================');
  console.log('       Cloudinary Record & Asset Cleanup / Purge Utility       ');
  console.log('===============================================================');
  console.log(`Cloud Name    : ${cloudName}`);
  console.log(`Target Folder : ${targetFolder}`);
  console.log(`Mode          : ${isDryRun ? 'DRY RUN (Preview Only - No deletions)' : 'LIVE EXECUTION'}`);
  console.log(`Clean DB      : ${shouldCleanDb ? 'YES (Will remove corresponding gallery docs)' : 'NO'}`);
  console.log(`Keep Folder   : ${shouldKeepFolder ? 'YES (Files only, keep folder)' : 'NO (Delete folders too)'}`);
  console.log('---------------------------------------------------------------\n');

  console.log(`[assets:cleanup] Scanning assets under prefix "${targetFolder}"...`);
  const existingResources = await listResourcesByPrefix(targetFolder);

  const imageCount = existingResources.image.length;
  const videoCount = existingResources.video.length;
  const rawCount = existingResources.raw.length;
  const totalAssets = imageCount + videoCount + rawCount;

  console.log(`\nFound ${totalAssets} total Cloudinary assets under "${targetFolder}":`);
  console.table({
    Images: imageCount,
    Videos: videoCount,
    Raw_Files_PDFs: rawCount,
    Total_Assets: totalAssets,
  });

  console.log(`[assets:cleanup] Discovering subfolders under "${targetFolder}"...`);
  const subFolders = await getAllSubFolders(targetFolder);
  console.log(`Found ${subFolders.length} subfolder(s) under "${targetFolder}".`);

  if (totalAssets === 0 && subFolders.length === 0) {
    console.log(`\n[assets:cleanup] Folder "${targetFolder}" is already empty. No resources to clean.`);
    if (shouldCleanDb) {
      await cleanMongoDbGallery(targetFolder);
    }
    return;
  }

  // DRY RUN EXIT
  if (isDryRun) {
    console.log('\n[DRY RUN] Operation complete. No files or folders were deleted.');
    console.log('[DRY RUN] Run without "--dry-run" (and use "-y" for non-interactive) to perform actual cleanup.');
    return;
  }

  // Interactive safety confirmation unless --force or -y is passed
  if (!isForce) {
    console.log('\n' + '!'.repeat(65));
    console.log(' ⚠️  DANGER / DATA LOSS WARNING:');
    console.log(` You are about to PERMANENTLY DELETE ${totalAssets} assets and ${subFolders.length} folders`);
    console.log(` from Cloudinary folder "${targetFolder}".`);
    console.log(' This action CANNOT BE UNDONE.');
    console.log('!'.repeat(65) + '\n');

    const confirmation = await askConfirmation(
      `Type "yes" or "${targetFolder}" to confirm permanent deletion: `,
    );

    if (confirmation !== 'yes' && confirmation !== targetFolder.toLowerCase()) {
      console.log('\n[assets:cleanup] Operation aborted by user. Nothing was deleted.');
      process.exit(0);
    }
  }

  console.log('\n[assets:cleanup] Starting asset deletion with CDN cache invalidation...');

  const deletedCounts = {
    image: 0,
    video: 0,
    raw: 0,
  };

  for (const resType of RESOURCE_TYPES) {
    process.stdout.write(`Deleting ${resType} assets... `);
    const count = await deleteResourcesForType(targetFolder, resType);
    deletedCounts[resType] = count;
    console.log(`Done (${count} deleted).`);
  }

  let foldersDeletedCount = 0;
  if (!shouldKeepFolder) {
    console.log('\n[assets:cleanup] Deleting folders from deepest to root...');
    // Sort deepest first (longest path first)
    const sortedFolders = [...subFolders].sort((a, b) => b.length - a.length);

    for (const folder of sortedFolders) {
      try {
        await cloudinary.api.delete_folder(folder);
        foldersDeletedCount++;
        console.log(`Deleted folder: ${folder}`);
      } catch (err) {
        console.warn(`Could not delete folder "${folder}": ${err.message}`);
      }
    }

    // Finally delete the root target folder
    try {
      await cloudinary.api.delete_folder(targetFolder);
      foldersDeletedCount++;
      console.log(`Deleted root folder: ${targetFolder}`);
    } catch (err) {
      console.warn(`Could not delete root folder "${targetFolder}": ${err.message}`);
    }
  }

  if (shouldCleanDb) {
    await cleanMongoDbGallery(targetFolder);
  }

  console.log('\n===============================================================');
  console.log('          Cloudinary Cleanup Successfully Completed!           ');
  console.log('===============================================================');
  console.table({
    'Images Deleted': deletedCounts.image,
    'Videos Deleted': deletedCounts.video,
    'Raw/PDFs Deleted': deletedCounts.raw,
    'Total Assets Deleted': deletedCounts.image + deletedCounts.video + deletedCounts.raw,
    'Folders Deleted': foldersDeletedCount,
    'CDN Cache Invalidation': 'Requested (invalidate: true)',
  });
  console.log('\nAll Cloudinary records under "' + targetFolder + '" have been cleaned.');
}

main().catch((err) => {
  console.error('\n[assets:cleanup] Fatal Error:', err);
  process.exit(1);
});
