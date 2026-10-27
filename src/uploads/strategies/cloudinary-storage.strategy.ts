import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageStrategy, UploadResult } from './storage-strategy.interface';
import { formatFileSizeErrorMessage } from '../utils/cloudinary-helper';
import { toRelativeMediaPath, getCloudinaryRootFolder } from '../../common/config';

@Injectable()
export class CloudinaryStorageStrategy implements IStorageStrategy {
  private readonly logger = new Logger(CloudinaryStorageStrategy.name);
  private cache: Map<string, { timestamp: number; data: any[] }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to prevent hitting 500 ops/hr rate limit
  private rateLimitUntil: number = 0;

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  private invalidateCache() {
    this.cache.clear();
    this.rateLimitUntil = 0;
  }

  private isRateLimitError(err: any): boolean {
    if (!err) return false;
    const httpCode = err.http_code || err.error?.http_code || err.status || err.statusCode;
    if (httpCode === 429 || httpCode === 420) return true;

    const message = (
      err.message ||
      err.error?.message ||
      (typeof err === 'string' ? err : JSON.stringify(err))
    ).toLowerCase();

    return (
      message.includes('slow down') ||
      message.includes('out of processing capacity') ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    );
  }

  async uploadFile(file: Express.Multer.File, folder?: string): Promise<UploadResult> {
    const rootFolder = getCloudinaryRootFolder(this.configService);
    let resolvedFolder = folder ? folder.trim().replace(/^\/+|\/+$/g, '') : '';
    const rootEndsWithAssets = rootFolder.toLowerCase().endsWith('/assets');

    if (!resolvedFolder) {
      resolvedFolder = rootEndsWithAssets ? rootFolder : `${rootFolder}/assets`;
    } else if (!resolvedFolder.toLowerCase().startsWith(rootFolder.toLowerCase())) {
      if (rootEndsWithAssets && resolvedFolder.toLowerCase().startsWith('assets/')) {
        const subFolder = resolvedFolder.slice(7).replace(/^\/+/, '');
        resolvedFolder = subFolder ? `${rootFolder}/${subFolder}` : rootFolder;
      } else {
        resolvedFolder = `${rootFolder}/${resolvedFolder}`;
      }
    }
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Empty file or missing file buffer provided');
    }

    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    const isMedia = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');

    const doUploadSingle = (resourceType: 'auto' | 'image' | 'raw'): Promise<UploadResult> => {
      return new Promise((resolve, reject) => {
        const cleanName = file.originalname.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        const options: Record<string, any> = {
          folder: resolvedFolder,
          resource_type: resourceType,
        };

        if (resourceType === 'raw') {
          const rawExt = isPdf && !cleanName.toLowerCase().endsWith('.pdf') ? '.pdf' : '';
          options.public_id = `${Date.now()}_${cleanName}${rawExt}`;
        } else if (isPdf) {
          // When resource_type is 'image', Cloudinary format extension is automatically appended on delivery.
          // Do not append .pdf to public_id to avoid double-extension .pdf.pdf
          options.public_id = `${Date.now()}_${cleanName}`;
        } else {
          options.use_filename = true;
          options.unique_filename = true;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
          options,
          (error, result) => {
            if (error) {
              const formattedMsg = formatFileSizeErrorMessage(error.message || String(error));
              if (typeof error === 'object' && error !== null) {
                error.message = formattedMsg;
              }
              return reject(error);
            }
            if (!result) {
              return reject(new Error('Cloudinary upload returned null result'));
            }
            let finalUrl = result.secure_url;
            if (isPdf && finalUrl && !finalUrl.toLowerCase().endsWith('.pdf')) {
              // Ensure PDF secure_url has .pdf extension if omitted by public_id
              const hashIdx = finalUrl.indexOf('#');
              const queryIdx = finalUrl.indexOf('?');
              const splitIdx = Math.min(
                queryIdx !== -1 ? queryIdx : finalUrl.length,
                hashIdx !== -1 ? hashIdx : finalUrl.length,
              );
              const basePath = finalUrl.slice(0, splitIdx);
              const suffix = finalUrl.slice(splitIdx);
              if (!basePath.toLowerCase().endsWith('.pdf')) {
                finalUrl = `${basePath}.pdf${suffix}`;
              }
            }

            // Normalize any duplicate .pdf.pdf extension to single .pdf
            if (finalUrl) {
              finalUrl = finalUrl.replace(/\.pdf\.pdf(?=($|\?|#))/gi, '.pdf');
            }

            const relativePath = toRelativeMediaPath(finalUrl, this.configService) as string;

            this.invalidateCache();
            resolve({
              url: relativePath,
              key: result.public_id,
              provider: 'cloudinary',
              mimeType: file.mimetype,
            });
          },
        );

        const readStream = Readable.from(file.buffer);
        readStream.pipe(uploadStream);
      });
    };

    const doUploadWithRetry = async (
      resourceType: 'auto' | 'image' | 'raw',
      maxRetries = 2,
    ): Promise<UploadResult> => {
      let lastError: any;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await doUploadSingle(resourceType);
        } catch (err: any) {
          lastError = err;
          if (this.isRateLimitError(err)) {
            if (attempt < maxRetries) {
              const delay = (attempt + 1) * 1500;
              this.logger.warn(
                `Cloudinary capacity limit reached (resource_type=${resourceType}, filename=${file.originalname}). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`,
              );
              await new Promise((res) => setTimeout(res, delay));
              continue;
            }
          }
          throw err;
        }
      }
      throw lastError;
    };

    if (isPdf) {
      try {
        return await doUploadWithRetry('image', 1);
      } catch (err: any) {
        const errMsg = err?.message || err?.error?.message || String(err);
        this.logger.warn(
          `Cloudinary 'image' upload failed for PDF ${file.originalname} (${errMsg}).`,
        );

        // If the file was compressed and failed as 'image', retry 'image' with the original uncompressed buffer
        const origBuf = (file as any)?.originalBuffer;
        if (origBuf && Buffer.isBuffer(origBuf) && origBuf.length > 0 && origBuf !== file.buffer) {
          try {
            this.logger.warn(
              `Retrying 'image' upload for PDF ${file.originalname} with original uncompressed buffer...`,
            );
            file.buffer = origBuf;
            file.size = origBuf.length;
            return await doUploadWithRetry('image', 1);
          } catch (retryErr: any) {
            this.logger.warn(
              `Fallback 'image' upload with original buffer also failed: ${retryErr?.message || retryErr}`,
            );
          }
        }

        await new Promise((res) => setTimeout(res, 1000));
        try {
          return await doUploadWithRetry('auto', 1);
        } catch (err2: any) {
          const err2Msg = err2?.message || err2?.error?.message || String(err2);
          this.logger.warn(
            `Cloudinary 'auto' upload failed for PDF ${file.originalname} (${err2Msg}). Retrying with 'raw'...`,
          );
          await new Promise((res) => setTimeout(res, 1000));
          return await doUploadWithRetry('raw', 1);
        }
      }
    }

    if (!isMedia) {
      try {
        return await doUploadWithRetry('raw', 1);
      } catch (err: any) {
        const errMsg = err?.message || err?.error?.message || String(err);
        this.logger.warn(
          `Cloudinary 'raw' upload failed for ${file.originalname} (${errMsg}). Retrying with 'auto'...`,
        );
        await new Promise((res) => setTimeout(res, 1000));
        return await doUploadWithRetry('auto', 1);
      }
    }

    try {
      return await doUploadWithRetry('auto', 1);
    } catch (err: any) {
      const errMsg = err?.message || err?.error?.message || String(err);
      this.logger.warn(
        `Cloudinary 'auto' upload failed for ${file.originalname} (${errMsg}). Retrying with 'image'...`,
      );
      await new Promise((res) => setTimeout(res, 1000));
      return await doUploadWithRetry('image', 1);
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      this.invalidateCache();
      const rootFolder = getCloudinaryRootFolder(this.configService);

      // Normalize key by stripping protocol, domain, and /upload/ path if present
      const cleanKey = key
        .replace(/^https?:\/\/[^\/]+\/(?:raw|image|video)\/upload\/(?:v\d+\/)?/, '')
        .replace(/^\/+/, '');

      const keyWithoutExt = cleanKey.replace(/\.[a-zA-Z0-9]+$/, '');
      const keyWithRoot = cleanKey.toLowerCase().startsWith(rootFolder.toLowerCase())
        ? cleanKey
        : `${rootFolder}/${cleanKey}`;
      const keyWithRootWithoutExt = keyWithRoot.replace(/\.[a-zA-Z0-9]+$/, '');

      const candidateKeys = Array.from(new Set([
        cleanKey,
        keyWithRoot,
        keyWithoutExt,
        keyWithRootWithoutExt,
      ])).filter(Boolean);

      const primaryConfig = {
        cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
        api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
        api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
      };

      const configs = [primaryConfig];

      // Cross-cloud deletion fallback to ensure legacy files (dnw7mgysa <-> niefrrkx) are properly cleaned up
      const secondaryName = primaryConfig.cloud_name === 'dnw7mgysa' ? 'niefrrkx' : 'dnw7mgysa';
      const secondaryKey = secondaryName === 'niefrrkx' ? '439722964466118' : '727794366589874';
      const secondarySecret = secondaryName === 'niefrrkx' ? 'kbxe8cBJ5eA-ohuWOO9_hAKgQGE' : 'oIZ3h6dnPsNzqW5UZiMhRn_7vlQ';
      configs.push({
        cloud_name: secondaryName,
        api_key: secondaryKey,
        api_secret: secondarySecret,
      });

      let anyDeleted = false;

      for (const cfg of configs) {
        if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) continue;
        cloudinary.config(cfg);

        for (const candidate of candidateKeys) {
          const hasRawExt = /\.(pdf|docx?|xlsx?|zip|rar|pptx?|txt|csv)$/i.test(candidate);
          const resourceTypes: Array<'raw' | 'image' | 'video'> = hasRawExt
            ? ['raw', 'image', 'video']
            : ['image', 'video', 'raw'];

          for (const rt of resourceTypes) {
            try {
              const res = await cloudinary.uploader.destroy(candidate, { resource_type: rt });
              if (res && res.result === 'ok') {
                this.logger.log(`Cloudinary asset destroyed successfully: [${cfg.cloud_name}] ${candidate} (${rt})`);
                anyDeleted = true;
                break;
              }
            } catch {
              // continue trying
            }
          }
          if (anyDeleted) break;
        }
        if (anyDeleted) break;
      }

      // Restore primary config
      cloudinary.config(primaryConfig);
      return anyDeleted;
    } catch (err) {
      this.logger.error(`Error deleting Cloudinary asset ${key}`, err);
      return false;
    }
  }

  async listResources(folder?: string): Promise<Array<{ id: string; url: string; title: string; category: string; resourceType: string; format: string }>> {
    const rootFolder = getCloudinaryRootFolder(this.configService);
    let targetFolder = folder ? folder.trim().replace(/^\/+|\/+$/g, '') : '';
    const rootEndsWithAssets = rootFolder.toLowerCase().endsWith('/assets');

    if (!targetFolder) {
      targetFolder = rootFolder;
    } else if (!targetFolder.toLowerCase().startsWith(rootFolder.toLowerCase())) {
      if (rootEndsWithAssets && targetFolder.toLowerCase().startsWith('assets/')) {
        const subFolder = targetFolder.slice(7).replace(/^\/+/, '');
        targetFolder = subFolder ? `${rootFolder}/${subFolder}` : rootFolder;
      } else {
        targetFolder = `${rootFolder}/${targetFolder}`;
      }
    }
    const cacheKey = targetFolder || '__ALL__';
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // Serve cached data if within TTL
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      return cached.data;
    }

    // If Cloudinary rate limit was recently triggered, return cached or empty without calling Cloudinary API
    if (now < this.rateLimitUntil) {
      return cached ? cached.data : [];
    }

    const fetchWithRetry = async (options: Record<string, any>, retries = 2, delayMs = 500): Promise<any> => {
      for (let i = 0; i <= retries; i++) {
        try {
          return await cloudinary.api.resources(options);
        } catch (err: any) {
          const isRateLimit = this.isRateLimitError(err);
          if (isRateLimit) {
            // Do not retry on rate limit errors
            throw err;
          }

          const isNetworkError = err?.code === 'ECONNRESET' || err?.message?.includes('ECONNRESET');
          if (i < retries && isNetworkError) {
            this.logger.warn(`Cloudinary Admin API connection reset (${err?.code || err?.message}), retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise((res) => setTimeout(res, delayMs));
            continue;
          }
          throw err;
        }
      }
    };

    try {
      const allResources: any[] = [];
      const resourceTypes = ['image', 'video', 'raw'];

      for (const resType of resourceTypes) {
        let nextCursor: string | undefined = undefined;
        do {
          const options: Record<string, any> = {
            max_results: 500,
            type: 'upload',
            resource_type: resType,
            prefix: targetFolder,
          };
          if (nextCursor) {
            options.next_cursor = nextCursor;
          }

          const res = await fetchWithRetry(options);
          if (res?.resources && Array.isArray(res.resources)) {
            allResources.push(...res.resources);
          }
          nextCursor = res?.next_cursor;
        } while (nextCursor);
      }

      const formatted = allResources.map((r: any) => {
        let assetUrl = r.secure_url || r.url || '';
        const isPdf = r.format === 'pdf' || (r.public_id || '').toLowerCase().endsWith('.pdf');
        if (isPdf && assetUrl && !assetUrl.toLowerCase().endsWith('.pdf')) {
          assetUrl = `${assetUrl}.pdf`;
        }
        if (assetUrl) {
          assetUrl = assetUrl.replace(/\.pdf\.pdf(?=($|\?|#))/gi, '.pdf');
        }
        const pubId = r.public_id || '';
        const parts = pubId.split('/');
        const cleanParts = parts.slice(0, -1).filter((p: string) => {
          const lower = p.toLowerCase();
          return lower !== 'ips-education' && lower !== 'assets';
        });

        const category = cleanParts.length > 0 ? cleanParts.join('/') : 'General';

        return {
          id: pubId || r.asset_id,
          url: assetUrl,
          title: parts.pop() || 'Cloudinary Asset',
          category,
          resourceType: r.resource_type || 'image',
          format: r.format || '',
        };
      });

      this.cache.set(cacheKey, { timestamp: now, data: formatted });
      return formatted;
    } catch (err: any) {
      const isRateLimit = this.isRateLimitError(err);
      
      if (isRateLimit) {
        // Lockout for 10 minutes on Rate Limit 420/429
        this.rateLimitUntil = now + 10 * 60 * 1000;
        this.logger.warn(`Cloudinary Admin API rate limit reached. Serving cached assets for 10 minutes until rate limit resets.`);
      } else {
        const errorDetail = err?.error?.message || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        this.logger.warn(`Could not fetch direct Cloudinary resources via Admin API: ${errorDetail}`);
      }

      if (cached) {
        return cached.data;
      }
      return [];
    }
  }

  async getUsage(): Promise<any> {
    const cacheKey = '__CLOUDINARY_USAGE__';
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      return cached.data;
    }

    if (now < this.rateLimitUntil && cached) {
      return cached.data;
    }

    try {
      const usage = await cloudinary.api.usage();
      this.cache.set(cacheKey, { timestamp: now, data: usage });
      return usage;
    } catch (err: any) {
      const isRateLimit = this.isRateLimitError(err);
      if (isRateLimit) {
        this.rateLimitUntil = now + 10 * 60 * 1000;
        this.logger.warn(`Cloudinary usage rate limit hit. Falling back to cached usage.`);
      } else {
        const errorDetail = err?.error?.message || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        this.logger.warn(`Failed to fetch Cloudinary usage via Admin API: ${errorDetail}`);
      }
      return cached ? cached.data : null;
    }
  }
}

