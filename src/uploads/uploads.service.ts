import { Injectable, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CloudinaryStorageStrategy } from './strategies/cloudinary-storage.strategy';
import { LocalStorageStrategy } from './strategies/local-storage.strategy';
import { GalleryRepository } from '../gallery/gallery.repository';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { extractCloudinaryPublicId, formatFileSizeErrorMessage, formatBytes } from './utils/cloudinary-helper';
import { FileCompressorService } from './services/file-compressor.service';
import { toRelativeMediaPath, getCloudinaryRootFolder } from '../common/config';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudinaryStrategy: CloudinaryStorageStrategy,
    private readonly localStorageStrategy: LocalStorageStrategy,
    private readonly fileCompressorService: FileCompressorService,
    @Inject(forwardRef(() => GalleryRepository))
    private readonly galleryRepository: GalleryRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async invalidateCloudinaryCache() {
    try {
      await this.cacheManager.del('cloudinary_resources_root');
      await this.cacheManager.del('cloudinary_resources_all');
    } catch {
      // ignore
    }
  }

  async deleteFileByUrl(url: string): Promise<boolean> {
    if (!url || typeof url !== 'string') return false;

    await this.invalidateCloudinaryCache();

    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'cloudinary');

    if (provider === 'cloudinary') {
      const publicIdWithExt = extractCloudinaryPublicId(url, true);
      const publicIdWithoutExt = extractCloudinaryPublicId(url, false);
      const targetKey = publicIdWithExt || publicIdWithoutExt || url;

      this.logger.log(`Deleting Cloudinary asset for URL/key: ${url} (resolved key: ${targetKey})`);
      return this.cloudinaryStrategy.deleteFile(targetKey);
    } else {
      const filename = url.replace(/^\/uploads\//, '');
      if (filename) {
        this.logger.log(`Deleting local storage file: ${filename}`);
        return this.localStorageStrategy.deleteFile(filename);
      }
    }

    return false;
  }

  async upload(file: Express.Multer.File, album: string = 'General', altText?: string, folder?: string) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file or empty file buffer provided');
    }

    // Compress file visually losslessly before pushing to storage provider
    const processedFile = await this.fileCompressorService.compress(file);

    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'cloudinary');

    const isDoc =
      processedFile.mimetype === 'application/pdf' ||
      processedFile.originalname.toLowerCase().endsWith('.pdf') ||
      (!processedFile.mimetype.startsWith('image/') && !processedFile.mimetype.startsWith('video/'));

    const rootFolder = getCloudinaryRootFolder(this.configService);
    const assetsPrefix = rootFolder.toLowerCase().replace(/\/+$/, '').endsWith('/assets')
      ? rootFolder
      : `${rootFolder}/assets`;

    const rawFolderInput = (folder || '').trim();
    const rawAlbumInput = (album || '').trim();

    // Deduplicate and sanitize folder input to avoid nested ips-education/assets/assets/Videos paths
    const cleanRawFolder = rawFolderInput
      .replace(/(?:assets\/Videos\/)+assets\/Videos\//gi, 'Videos/')
      .replace(/(?:Videos\/)+Videos\//gi, 'Videos/');
    const lowerFolder = cleanRawFolder.toLowerCase();
    const lowerAlbum = rawAlbumInput.toLowerCase();

    let targetFolder: string;

    if (lowerFolder.startsWith(`${rootFolder.toLowerCase()}/`)) {
      targetFolder = cleanRawFolder;
    } else if (lowerFolder.includes('/assets/')) {
      const sub = cleanRawFolder.replace(/^.*\/assets\//i, '');
      targetFolder = `${assetsPrefix}/${sub}`;
    } else if (lowerFolder.startsWith('assets/')) {
      const sub = cleanRawFolder.replace(/^assets\//i, '');
      targetFolder = `${assetsPrefix}/${sub}`;
    } else if (lowerFolder.includes('icons') || lowerAlbum.includes('icons')) {
      targetFolder = `${assetsPrefix}/Settings/Icons`;
    } else if (lowerFolder.includes('logos') || lowerAlbum.includes('logos')) {
      targetFolder = `${assetsPrefix}/Settings/Logos`;
    } else if (lowerFolder.includes('settings') || lowerAlbum.includes('settings') || lowerFolder.includes('school-settings') || lowerAlbum.includes('school-settings')) {
      targetFolder = `${assetsPrefix}/Settings/Home`;
    } else if (lowerFolder.includes('career') || lowerAlbum.includes('career')) {
      targetFolder = `${assetsPrefix}/Documents/Career`;
    } else if (lowerFolder.includes('admission') || lowerAlbum.includes('admission')) {
      targetFolder = `${assetsPrefix}/Documents/Admission`;
    } else if (lowerFolder.includes('pressrelease') || lowerFolder.includes('press') || lowerAlbum.includes('press')) {
      targetFolder = `${assetsPrefix}/PressRelease`;
    } else if (lowerFolder.includes('student') || lowerAlbum.includes('student')) {
      targetFolder = `${assetsPrefix}/Student`;
    } else if (lowerFolder.includes('staff') || lowerAlbum.includes('staff')) {
      targetFolder = isDoc ? `${assetsPrefix}/Documents/Staff` : `${assetsPrefix}/Staff`;
    } else if (processedFile.mimetype.startsWith('video/') || lowerFolder.includes('video') || lowerAlbum.includes('video')) {
      targetFolder = `${assetsPrefix}/Videos`;
    } else if (isDoc) {
      targetFolder = `${assetsPrefix}/Documents/General`;
    } else if (cleanRawFolder) {
      const cleanFolder = cleanRawFolder.replace(/^\/+|\/+$/g, '').replace(/^assets\//i, '');
      if (cleanFolder.toLowerCase().startsWith('album/')) {
        const sub = cleanFolder.replace(/^album\//i, '');
        const formattedSub = sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : 'General';
        targetFolder = `${assetsPrefix}/Album/${formattedSub}`;
      } else if (cleanFolder.toLowerCase() === 'others' || cleanFolder.toLowerCase() === 'other') {
        targetFolder = `${assetsPrefix}/Others`;
      } else {
        targetFolder = `${assetsPrefix}/${cleanFolder}`;
      }
    } else {
      // User did not pass directory name -> store inside others (not inside album)
      targetFolder = `${assetsPrefix}/Others`;
    }

    // Final check: Guarantee no duplicate ips-education/assets/assets/ or assets/assets/ in targetFolder
    targetFolder = targetFolder
      .replace(/\/ips-education\/assets\/ips-education\/assets\//gi, '/ips-education/assets/')
      .replace(/\/ips-education\/assets\/assets\//gi, '/ips-education/assets/')
      .replace(/^ips-education\/assets\/assets\//gi, 'ips-education/assets/')
      .replace(/\/assets\/assets\//gi, '/assets/')
      .replace(/^assets\/assets\//gi, 'assets/');

    let result: import('./strategies/storage-strategy.interface').UploadResult;

    try {
      const strategy = provider === 'cloudinary' ? this.cloudinaryStrategy : this.localStorageStrategy;
      result = await strategy.uploadFile(processedFile, targetFolder);
    } catch (err: any) {
      const rawMsg = err?.message || err?.error?.message || (typeof err === 'string' ? err : String(err)) || 'Unknown upload error';
      const formattedMsg = formatFileSizeErrorMessage(rawMsg);
      this.logger.error(`Storage provider (${provider}) upload failed for "${processedFile?.originalname}": ${formattedMsg}`);
      throw new BadRequestException(`Cloudinary upload failed: ${formattedMsg}`);
    }

    let fileType: 'image' | 'pdf' | 'video' | 'document' = 'document';
    if (processedFile.mimetype.startsWith('image/')) fileType = 'image';
    else if (processedFile.mimetype.startsWith('video/')) fileType = 'video';
    else if (processedFile.mimetype === 'application/pdf') fileType = 'pdf';

    const isOthersUpload =
      targetFolder.toLowerCase().endsWith('/others') ||
      lowerFolder === 'others' ||
      lowerAlbum === 'others' ||
      lowerAlbum.includes('visual editor');

    const isSettingsUpload = targetFolder.includes('/Settings/');
    const eventType = isSettingsUpload
      ? (targetFolder.endsWith('/Icons') || lowerFolder.includes('icons') || lowerAlbum.includes('icons')
          ? 'Icons'
          : targetFolder.endsWith('/Logos') || lowerFolder.includes('logos') || lowerAlbum.includes('logos')
          ? 'Logos'
          : targetFolder.endsWith('/Home') || lowerFolder.includes('home') || lowerAlbum.includes('home')
          ? 'Home'
          : 'Settings')
      : isOthersUpload
      ? 'Others'
      : isDoc
      ? (album && album !== 'General' ? album : 'Documents')
      : (album || 'General');

    const directoryPath = isOthersUpload ? 'Others' : targetFolder;

    const computedEventName = altText && altText.trim() ? altText.trim() : eventType;

    const relativeUrl = toRelativeMediaPath(result.url, this.configService) as string;

    const asset = await this.galleryRepository.create({
      eventName: computedEventName,
      fileUrl: [relativeUrl],
      eventType: eventType,
      directory: directoryPath,
      mimeType: processedFile.mimetype,
    });

    const plainAsset = typeof (asset as any).toObject === 'function' ? (asset as any).toObject() : asset;

    await this.invalidateCloudinaryCache();

    return {
      ...plainAsset,
      url: relativeUrl,
      fileUrl: asset.fileUrl || [relativeUrl],
      mimeType: asset.mimeType || processedFile.mimetype,
      key: result.key,
      provider: result.provider,
    };
  }

  async findAll(queryDto: PaginationQueryDto = {}, eventType?: string) {
    const additionalFilter: Record<string, any> = {};
    if (eventType) additionalFilter.eventType = eventType;

    return this.galleryRepository.findAll(
      queryDto,
      ['eventName', 'eventType'],
      additionalFilter,
    );
  }

  async findOne(id: string) {
    return this.galleryRepository.findById(id);
  }

  async remove(id: string) {
    await this.invalidateCloudinaryCache();

    if (id.startsWith('cdn-') || id.includes('http') || id.includes('/')) {
      let targetUrl = id.replace(/^cdn-/, '');

      const existing = await this.galleryRepository.findAll(
        { page: 1, limit: 10 },
        [],
        { fileUrl: { $in: [targetUrl] } },
      );
      const items = existing.items || (existing as any).data || [];

      for (const doc of items) {
        const docId = (doc as any)._id || (doc as any).id;
        if (docId) {
          await this.galleryRepository.delete(String(docId));
        }
      }

      await this.deleteFileByUrl(targetUrl);
      return { deleted: true, id };
    }

    try {
      const asset = await this.galleryRepository.findById(id);
      if (asset && Array.isArray(asset.fileUrl)) {
        for (const url of asset.fileUrl) {
          await this.deleteFileByUrl(url);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not fetch asset ${id} for Cloudinary deletion prior to database removal: ${err}`);
    }

    return this.galleryRepository.delete(id);
  }

  async getCloudinaryResources(folder?: string) {
    const cacheKey = `cloudinary_resources_${folder || 'root'}`;
    try {
      const cached = await this.cacheManager.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // ignore
    }

    const resources = await this.cloudinaryStrategy.listResources(folder);
    if (resources && Array.isArray(resources) && resources.length > 0) {
      try {
        await this.cacheManager.set(cacheKey, resources, 120 * 1000); // 2 minutes
      } catch {
        // ignore
      }
    }
    return resources;
  }

  async getStorageUsage() {
    const cacheKey = 'storage_usage_summary';
    try {
      const cached = await this.cacheManager.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch {
      // ignore
    }

    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'cloudinary');

    if (provider !== 'cloudinary') {
      const localResult = {
        provider: 'local',
        plan: 'Local Storage',
        lastUpdated: new Date().toISOString(),
        credits: null,
        storage: {
          usedBytes: 0,
          usedFormatted: '0 MB',
          creditsUsage: 0,
        },
        bandwidth: {
          usedBytes: 0,
          usedFormatted: '0 MB',
          creditsUsage: 0,
        },
        transformations: {
          usage: 0,
          creditsUsage: 0,
        },
        resources: {
          total: 0,
          derived: 0,
          objects: 0,
        },
        mediaLimits: {
          imageMax: '10 MB',
          videoMax: '100 MB',
          rawMax: '10 MB',
        },
        status: 'ok',
      };
      return localResult;
    }

    try {
      const raw = await this.cloudinaryStrategy.getUsage();
      if (!raw) {
        return {
          provider: 'cloudinary',
          plan: 'Free',
          lastUpdated: new Date().toISOString(),
          status: 'warning',
          message: 'Unable to retrieve live Cloudinary usage details or rate limited.',
        };
      }

      const creditsUsage = raw.credits?.usage ?? 0;
      const creditsLimit = raw.credits?.limit ?? 25;
      const creditsPercentUsed = raw.credits?.used_percent ?? (creditsLimit > 0 ? (creditsUsage / creditsLimit) * 100 : 0);
      const creditsRemaining = Math.max(0, creditsLimit - creditsUsage);
      const creditsPercentRemaining = Math.max(0, 100 - creditsPercentUsed);

      const storageBytes = raw.storage?.usage ?? 0;
      const bandwidthBytes = raw.bandwidth?.usage ?? 0;

      const result = {
        provider: 'cloudinary',
        plan: raw.plan || 'Free',
        lastUpdated: raw.last_updated || new Date().toISOString().split('T')[0],
        dateRequested: raw.date_requested,
        credits: {
          usage: Number(creditsUsage.toFixed(2)),
          limit: creditsLimit,
          remaining: Number(creditsRemaining.toFixed(2)),
          percentUsed: Number(creditsPercentUsed.toFixed(2)),
          percentRemaining: Number(creditsPercentRemaining.toFixed(2)),
        },
        storage: {
          usedBytes: storageBytes,
          usedFormatted: formatBytes(storageBytes),
          creditsUsage: raw.storage?.credits_usage ?? 0,
        },
        bandwidth: {
          usedBytes: bandwidthBytes,
          usedFormatted: formatBytes(bandwidthBytes),
          creditsUsage: raw.bandwidth?.credits_usage ?? 0,
        },
        transformations: {
          usage: raw.transformations?.usage ?? 0,
          creditsUsage: raw.transformations?.credits_usage ?? 0,
          breakdown: raw.transformations?.breakdown,
        },
        resources: {
          total: raw.resources ?? 0,
          derived: raw.derived_resources ?? 0,
          objects: raw.objects?.usage ?? 0,
        },
        mediaLimits: {
          imageMax: formatBytes(raw.media_limits?.image_max_size_bytes || 10485760),
          videoMax: formatBytes(raw.media_limits?.video_max_size_bytes || 104857600),
          rawMax: formatBytes(raw.media_limits?.raw_max_size_bytes || 10485760),
        },
        rateLimit: {
          allowed: raw.rate_limit_allowed,
          remaining: raw.rate_limit_remaining,
          resetAt: raw.rate_limit_reset_at,
        },
        status: creditsPercentUsed > 90 ? 'critical' : creditsPercentUsed > 75 ? 'warning' : 'ok',
      };

      try {
        await this.cacheManager.set(cacheKey, result, 180 * 1000); // 3 minutes cache
      } catch {
        // ignore
      }

      return result;
    } catch (err: any) {
      this.logger.error(`Error in getStorageUsage: ${err.message}`);
      return {
        provider: 'cloudinary',
        plan: 'Free',
        status: 'error',
        message: err.message,
      };
    }
  }
}

