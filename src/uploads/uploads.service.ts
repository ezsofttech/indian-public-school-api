import { Injectable, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryStorageStrategy } from './strategies/cloudinary-storage.strategy';
import { LocalStorageStrategy } from './strategies/local-storage.strategy';
import { GalleryRepository } from '../gallery/gallery.repository';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { extractCloudinaryPublicId, formatFileSizeErrorMessage } from './utils/cloudinary-helper';
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
  ) {}

  async deleteFileByUrl(url: string): Promise<boolean> {
    if (!url || typeof url !== 'string') return false;

    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'cloudinary');

    if (provider === 'cloudinary') {
      const publicId = extractCloudinaryPublicId(url);
      if (publicId) {
        this.logger.log(`Deleting Cloudinary asset with public ID: ${publicId}`);
        return this.cloudinaryStrategy.deleteFile(publicId);
      }
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
      } else {
        targetFolder = `${assetsPrefix}/${cleanFolder}`;
      }
    } else if (rawAlbumInput && rawAlbumInput !== 'General' && rawAlbumInput !== 'Galleries' && rawAlbumInput !== 'Gallery') {
      targetFolder = `${assetsPrefix}/Album/${rawAlbumInput}`;
    } else {
      targetFolder = `${assetsPrefix}/Album`;
    }

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

    const isSettingsUpload = targetFolder.includes('/Settings/');
    const eventType = isSettingsUpload
      ? 'Settings'
      : isDoc
      ? (album && album !== 'General' ? album : 'Documents')
      : (album || 'General');

    const directoryPath = targetFolder;

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
    return this.cloudinaryStrategy.listResources(folder);
  }
}

