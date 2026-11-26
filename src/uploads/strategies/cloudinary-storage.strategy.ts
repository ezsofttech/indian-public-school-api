import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IStorageStrategy, UploadResult } from './storage-strategy.interface';
import { formatFileSizeErrorMessage } from '../utils/cloudinary-helper';
import { toRelativeMediaPath, getCloudinaryRootFolder } from '../../common/config';
import { MulterFile } from '../../common/interfaces/multer.interface';

@Injectable()
export class CloudinaryStorageStrategy implements IStorageStrategy {
  private readonly logger = new Logger(CloudinaryStorageStrategy.name);
  private cache: Map<string, { timestamp: number; data: any[] }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to prevent hitting 500 ops/hr rate limit
  private rateLimitUntil: number = 0;

  constructor(private readonly configService: ConfigService) {}

  private getCredentials() {
    return {
      cloudName: (this.configService.get<string>('cloudinary.cloudName') || '').trim(),
      apiKey: (this.configService.get<string>('cloudinary.apiKey') || '').trim(),
      apiSecret: (this.configService.get<string>('cloudinary.apiSecret') || '').trim(),
    };
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

  async uploadFile(file: MulterFile, folder?: string): Promise<UploadResult> {
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
    const isVideo = file.mimetype.startsWith('video/');
    const isMedia = file.mimetype.startsWith('image/') || isVideo;

    const doUpload = async (resourceType: 'image' | 'video' | 'raw' | 'auto'): Promise<UploadResult> => {
      const { cloudName, apiKey, apiSecret } = this.getCredentials();
      if (!cloudName || !apiKey || !apiSecret) {
        throw new BadRequestException('Cloudinary credentials (cloudName, apiKey, apiSecret) are missing in environment');
      }

      const cleanName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const publicId = `${Date.now()}_${cleanName}${resourceType === 'raw' && isPdf ? '.pdf' : ''}`;
      const timestamp = Math.floor(Date.now() / 1000);

      const paramsToSign: Record<string, string> = {
        folder: resolvedFolder,
        public_id: publicId,
        timestamp: String(timestamp),
      };

      const signString = Object.keys(paramsToSign).sort().map((k) => `${k}=${paramsToSign[k]}`).join('&') + apiSecret;
      const signature = crypto.createHash('sha1').update(signString).digest('hex');

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      formData.append('file', blob, file.originalname);
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('signature', signature);
      formData.append('folder', resolvedFolder);
      formData.append('public_id', publicId);

      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const result = await res.json();

      if (!res.ok || !result || result.error) {
        const rawErr = result?.error?.message || `Upload failed with status ${res.status}`;
        const formattedMsg = formatFileSizeErrorMessage(rawErr);
        const errObj: any = new Error(formattedMsg);
        errObj.http_code = res.status;
        throw errObj;
      }

      let finalUrl = result.secure_url || result.url;
      if (isPdf && finalUrl && !finalUrl.toLowerCase().endsWith('.pdf')) {
        const [base] = finalUrl.split(/[?#]/);
        finalUrl = `${base}.pdf`;
      }
      if (finalUrl) {
        finalUrl = finalUrl.replace(/\.pdf\.pdf(?=($|\?|#))/gi, '.pdf');
      }

      const relativePath = toRelativeMediaPath(finalUrl, this.configService) as string;
      this.invalidateCache();

      return {
        url: relativePath,
        key: result.public_id,
        provider: 'cloudinary',
        mimeType: file.mimetype,
      };
    };

    const initialType = isVideo ? 'video' : isPdf || isMedia ? 'image' : 'raw';
    try {
      return await doUpload(initialType);
    } catch (err: any) {
      if (this.isRateLimitError(err)) {
        await new Promise((res) => setTimeout(res, 1500));
        return await doUpload(initialType);
      }
      if (initialType === 'image') {
        this.logger.warn(`Cloudinary 'image' upload failed for ${file.originalname}, falling back to 'raw'...`);
        return await doUpload('raw');
      }
      throw err;
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      this.invalidateCache();
      const { cloudName, apiKey, apiSecret } = this.getCredentials();
      if (!cloudName || !apiKey || !apiSecret) {
        this.logger.warn('Cloudinary credentials missing for deleteFile');
        return false;
      }

      let cleanKey = decodeURIComponent(key).trim();
      if (cleanKey.includes('/upload/')) {
        cleanKey = cleanKey.split('/upload/')[1] || cleanKey;
      }
      cleanKey = cleanKey
        .replace(/^(?:(?:[a-z]{1,4}_[a-zA-Z0-9_.-]+(?:,[a-z]{1,4}_[a-zA-Z0-9_.-]+)*)\/)+/i, '')
        .replace(/^v\d+\//i, '')
        .split('?')[0]
        .split('#')[0]
        .replace(/^\/+/, '');

      const rootFolder = getCloudinaryRootFolder(this.configService);
      const rootClean = (rootFolder || 'ips-education').replace(/^\/+|\/+$/g, '');
      const strippedClean = cleanKey.replace(new RegExp(`^${rootClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/`, 'i'), '');

      const candidates = Array.from(new Set([
        cleanKey,
        cleanKey.replace(/\.[a-zA-Z0-9]+$/, ''),
        `${rootClean}/${strippedClean}`.replace(/\/+/g, '/'),
        `${rootClean}/${strippedClean}`.replace(/\/+/g, '/').replace(/\.[a-zA-Z0-9]+$/, ''),
        strippedClean,
        strippedClean.replace(/\.[a-zA-Z0-9]+$/, ''),
      ])).filter(Boolean);

      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      const hasRawExt = /\.(pdf|docx?|xlsx?|zip|rar|pptx?|txt|csv)$/i.test(cleanKey);
      const resourceTypes: Array<'raw' | 'image' | 'video'> = hasRawExt
        ? ['raw', 'image', 'video']
        : ['image', 'video', 'raw'];

      for (const candidate of candidates) {
        for (const rt of resourceTypes) {
          try {
            const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${rt}/destroy`;
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ public_id: candidate }),
            });
            const data = await res.json();
            if (data?.result === 'ok' || data?.result === 'deleted') {
              this.logger.log(`Cloudinary asset destroyed: [${cloudName}] ${candidate} (${rt})`);
              return true;
            }
          } catch {
            // continue
          }
        }
      }
      return false;
    } catch (err) {
      this.logger.error(`Error deleting Cloudinary asset ${key}`, err);
      return false;
    }
  }

  async listResources(folder?: string): Promise<Array<{ id: string; url: string; title: string; category: string; resourceType: string; format: string; createdAt?: string }>> {
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

    if (now < this.rateLimitUntil) {
      return cached ? cached.data : [];
    }

    const { cloudName, apiKey, apiSecret } = this.getCredentials();
    if (!cloudName || !apiKey || !apiSecret) {
      return cached ? cached.data : [];
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const fetchWithRetry = async (resType: string, cursor?: string, retries = 2, delayMs = 500): Promise<any> => {
      const query = new URLSearchParams({
        max_results: '500',
        type: 'upload',
        prefix: targetFolder,
      });
      if (cursor) {
        query.set('next_cursor', cursor);
      }

      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resType}?${query.toString()}`;

      for (let i = 0; i <= retries; i++) {
        try {
          const res = await fetch(endpoint, {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          });
          const data = await res.json();
          if (!res.ok) {
            const err: any = new Error(data?.error?.message || `Failed to fetch resources with status ${res.status}`);
            err.http_code = res.status;
            throw err;
          }
          return data;
        } catch (err: any) {
          if (this.isRateLimitError(err)) {
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
          const res = await fetchWithRetry(resType, nextCursor);
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
        const configuredRoot = getCloudinaryRootFolder(this.configService);
        const rootParts = configuredRoot.toLowerCase().split('/').filter(Boolean);
        const cleanParts = parts.slice(0, -1).filter((p: string) => {
          const lower = p.toLowerCase();
          return !rootParts.includes(lower) && lower !== 'assets';
        });

        const category = cleanParts.length > 0 ? cleanParts.join('/') : 'General';

        return {
          id: pubId || r.asset_id,
          url: assetUrl,
          title: parts.pop() || 'Cloudinary Asset',
          category,
          resourceType: r.resource_type || 'image',
          format: r.format || '',
          createdAt: r.created_at || undefined,
        };
      });

      this.cache.set(cacheKey, { timestamp: now, data: formatted });
      return formatted;
    } catch (err: any) {
      const isRateLimit = this.isRateLimitError(err);
      
      if (isRateLimit) {
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

    const { cloudName, apiKey, apiSecret } = this.getCredentials();
    if (!cloudName || !apiKey || !apiSecret) {
      return cached ? cached.data : null;
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/usage`;

    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      const usage = await res.json();
      if (!res.ok) {
        const err: any = new Error(usage?.error?.message || `Failed to fetch usage: status ${res.status}`);
        err.http_code = res.status;
        throw err;
      }
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
