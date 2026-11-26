import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { GalleryRepository } from './gallery.repository';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UploadsService } from '../uploads/uploads.service';
import { formatPrettyEventName, toRelativeMediaPath } from '../common/config';

function cleanAssetPath(url: string): string {
  if (!url || typeof url !== 'string') return url;
  const rel = toRelativeMediaPath(url);
  return typeof rel === 'string' ? rel : url;
}

export function getCanonicalAssetKey(url: string): string {
  if (!url || typeof url !== 'string') return '';
  let str = url.trim().toLowerCase();
  try {
    str = decodeURIComponent(str);
  } catch {}
  str = str.split('?')[0].split('#')[0];
  const filename = str.split('/').pop() || '';
  if (filename && filename.includes('.') && filename.length > 5) {
    return filename;
  }
  return str.replace(/^https?:\/\/[^\/]+/i, '').replace(/^\/+/, '');
}

export function extractAlbumName(album?: string, directory?: string, eventType?: string): string {
  if (album && album.trim() && album.trim().toLowerCase() !== 'album') {
    const a = album.trim();
    if (a.toLowerCase().startsWith('album/')) {
      return a.slice('album/'.length);
    }
    return a;
  }
  const dir = String(directory || '').trim();
  if (dir.toLowerCase().includes('album')) {
    const parts = dir.replace(/^[/\\]+|[/\\]+$/g, '').split(/[/\\]+/);
    const idx = parts.findIndex((p) => p.toLowerCase() === 'album');
    if (idx !== -1 && parts[idx + 1]) {
      return parts[idx + 1];
    }
  }
  if (dir && !dir.toLowerCase().includes('album') && dir.toLowerCase() !== 'album') {
    return dir;
  }
  if (eventType && eventType.trim() && !['general', 'others'].includes(eventType.toLowerCase())) {
    return eventType.trim();
  }
  return 'Events';
}

export function inferDirectoryFromItem(directory?: string, fileUrl?: string | string[], album?: string, eventType?: string): string {
  if (directory && directory.trim() && directory.trim() !== '/') {
    return directory.trim();
  }
  const urls = Array.isArray(fileUrl) ? fileUrl : typeof fileUrl === 'string' ? [fileUrl] : [];
  for (const u of urls) {
    if (!u) continue;
    const lower = u.toLowerCase();
    if (lower.includes('/others/') || lower.includes('others')) return 'Others';
    if (lower.includes('/documents/admission')) return 'Documents/Admission';
    if (lower.includes('/documents/')) return 'Documents/General';
    if (lower.includes('/settings/logos')) return 'Settings/Logos';
    if (lower.includes('/settings/icons')) return 'Settings/Icons';
    if (lower.includes('/settings/home') || lower.includes('/settings/')) return 'Settings/Home';
    if (lower.includes('/student/')) return 'Student';
    if (lower.includes('/staff/')) return 'Staff';
    if (lower.includes('/videos/')) return 'Videos';
    if (lower.includes('/pressrelease/') || lower.includes('/press/')) return 'PressRelease';
    const match = u.match(/\/album\/([^\/\?#]+)/i);
    if (match && match[1]) {
      return `Album/${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
  }
  if (album && album.trim() && !['general', 'others'].includes(album.toLowerCase())) {
    return `Album/${album.trim()}`;
  }
  if (eventType && eventType.trim() && !['general', 'others'].includes(eventType.toLowerCase())) {
    return `Album/${eventType.trim()}`;
  }
  return 'Others';
}

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);
  private cacheKeys = new Set<string>();

  constructor(
    private readonly galleryRepository: GalleryRepository,
    @Inject(forwardRef(() => UploadsService))
    private readonly uploadsService: UploadsService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  public async invalidateGalleryCache() {
    try {
      for (const key of this.cacheKeys) {
        await this.cacheManager.del(key);
      }
      this.cacheKeys.clear();
    } catch {
      // ignore
    }
    try {
      await this.uploadsService.invalidateCloudinaryCache();
    } catch {
      // ignore
    }
  }

  async create(createGalleryDto: CreateGalleryDto) {
    try {
      if (createGalleryDto.eventName) {
        createGalleryDto.eventName = formatPrettyEventName(createGalleryDto.eventName);
      }
      if (!createGalleryDto.album) {
        createGalleryDto.album = extractAlbumName(undefined, createGalleryDto.directory, createGalleryDto.eventType);
      }
      if (!createGalleryDto.directory || createGalleryDto.directory === '/album/General') {
        const alb = createGalleryDto.album || 'Events';
        createGalleryDto.directory = alb.toLowerCase() === 'others' ? 'Others' : `Album/${alb}`;
      }
      if (Array.isArray(createGalleryDto.fileUrl)) {
        createGalleryDto.fileUrl = createGalleryDto.fileUrl.map(u => cleanAssetPath(u));
      }
      if ((createGalleryDto as any).url) {
        (createGalleryDto as any).url = cleanAssetPath((createGalleryDto as any).url);
      }
      if (createGalleryDto.fileUrl && createGalleryDto.fileUrl.length > 0) {
        const searchUrls = new Set<string>();
        for (const u of createGalleryDto.fileUrl) {
          if (!u) continue;
          searchUrls.add(u);
          const cleaned = cleanAssetPath(u);
          searchUrls.add(cleaned);
          try {
            searchUrls.add(decodeURIComponent(cleaned));
            searchUrls.add(decodeURIComponent(u));
            searchUrls.add(encodeURI(cleaned));
          } catch {}
        }

        const existing = await this.galleryRepository.findAll(
          { page: 1, limit: 10 },
          [],
          { fileUrl: { $in: Array.from(searchUrls) } },
        );
        const items = existing.items || (existing as any).data || [];
        if (items.length > 0) {
          const docId = (items[0] as any)._id || (items[0] as any).id;
          this.logger.log(`Existing gallery document found for fileUrl (${String(docId)}). Updating instead of creating duplicate.`);
          const res = await this.galleryRepository.update(String(docId), createGalleryDto);
          return res;
        }
      }
      const created = await this.galleryRepository.create(createGalleryDto);
      return created;
    } finally {
      await this.invalidateGalleryCache();
    }
  }

  async findAll(queryDto: PaginationQueryDto = {}, eventType?: string, directory?: string) {
    const page = Math.max(1, Number(queryDto.page) || 1);
    const limit = Math.max(1, Math.min(500, Number(queryDto.limit) || 10));
    const search = (queryDto.search || '').trim();

    // Determine eventType filter value from all possible query parameters
    let activeEventType = (eventType || (queryDto as any).eventType || '').trim();
    if (!activeEventType && (queryDto as any).filterKey && (queryDto as any).filterValue) {
      if (String((queryDto as any).filterKey).toLowerCase() === 'eventtype') {
        activeEventType = String((queryDto as any).filterValue).trim();
      }
    }
    if (!activeEventType && (queryDto as any).filterValue && (queryDto as any).filterValue !== 'All' && (queryDto as any).filterKey !== 'directory') {
      activeEventType = String((queryDto as any).filterValue).trim();
    }

    // Determine directory filter value from all possible query parameters
    let activeDirectory = (directory || (queryDto as any).directoryName || (queryDto as any).directory || '').trim();
    if (!activeDirectory && (queryDto as any).filterKey && (queryDto as any).filterValue) {
      const fk = String((queryDto as any).filterKey).toLowerCase();
      if (fk === 'directory' || fk === 'directoryname') {
        activeDirectory = String((queryDto as any).filterValue).trim();
      }
    }

    const sortBy = queryDto.sortBy || 'createdAt';
    const sortOrder = String(queryDto.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const cacheKey = `gallery_list_${page}_${limit}_${activeEventType}_${activeDirectory}_${search}_${sortBy}_${sortOrder}`;
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const additionalFilter: Record<string, any> = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    if (activeEventType && activeEventType.toLowerCase() !== 'all') {
      const escapedType = activeEventType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      additionalFilter.eventType = new RegExp(`^${escapedType}$`, 'i');
    }

    if (activeDirectory && activeDirectory.toLowerCase() !== 'all') {
      const targetDir = activeDirectory.trim().replace(/^\/+|\/+$/g, '');
      const escapedDir = targetDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (targetDir.toLowerCase() === 'album') {
        additionalFilter.directory = new RegExp('^Album', 'i');
      } else {
        additionalFilter.directory = new RegExp(`^${escapedDir}`, 'i');
      }
    }

    const dbResult = await this.galleryRepository.findAll(
      { page, limit, search, sortBy, sortOrder },
      ['eventName', 'album', 'eventType', 'directory', 'publicId', 'fileUrl'],
      additionalFilter,
    );

    const rawItems = dbResult.items || (dbResult as any).data || [];
    const items = rawItems.map((item: any) => {
      const doc = item.toObject ? item.toObject() : { ...item };
      doc.id = String(doc._id || doc.id);
      doc._id = String(doc._id || doc.id);
      doc.directory = inferDirectoryFromItem(doc.directory, doc.fileUrl, doc.album, doc.eventType);
      doc.album = extractAlbumName(doc.album, doc.directory, doc.eventType);
      return doc;
    });

    const shouldIncludeCdn =
      (queryDto as any).includeCdn === 'true' ||
      (queryDto as any).includeCdn === true ||
      (queryDto as any).all === 'true' ||
      limit >= 500;

    if (shouldIncludeCdn) {
      try {
        const cdnResources = await this.uploadsService.getCloudinaryResources();
        if (Array.isArray(cdnResources) && cdnResources.length > 0) {
          const existingUrls = new Set<string>();
          items.forEach((it: any) => {
            const urls = Array.isArray(it.fileUrl) ? it.fileUrl : typeof it.fileUrl === 'string' ? [it.fileUrl] : [];
            urls.forEach((u: string) => {
              if (u) {
                existingUrls.add(u);
                const fn = u.split('/').pop()?.split('?')[0];
                if (fn) existingUrls.add(fn);
              }
            });
          });

          cdnResources.forEach((res: any, idx: number) => {
            const resUrl = (res.url || '').trim();
            const resId = (res.id || '').trim();
            const filename = resUrl.split('/').pop()?.split('?')[0];
            const exists =
              (resUrl && existingUrls.has(resUrl)) ||
              (resId && existingUrls.has(resId)) ||
              (filename && existingUrls.has(filename));

            if (!exists) {
              const cat = res.category || 'General';
              const lowerCat = cat.toLowerCase();
              let dirPath = cat;
              let albumName = cat;
              if (lowerCat.startsWith('album/')) {
                albumName = cat.slice('album/'.length);
                dirPath = cat;
              } else if (lowerCat === 'others' || lowerCat === 'other') {
                dirPath = 'Others';
                albumName = 'Others';
              }

              items.push({
                _id: `cdn-${res.id || idx}`,
                id: `cdn-${res.id || idx}`,
                publicId: res.id || `cdn-${idx}`,
                eventName: res.title || cat,
                album: albumName,
                eventType: cat,
                directory: dirPath,
                fileUrl: [res.url],
                mimeType: res.mimeType || (res.format === 'pdf' ? 'application/pdf' : res.resourceType === 'video' ? `video/${res.format || 'mp4'}` : `image/${res.format || 'jpeg'}`),
                isCdnResource: true,
                createdAt: res.createdAt ? new Date(res.createdAt) : new Date(0),
                updatedAt: res.createdAt ? new Date(res.createdAt) : new Date(0),
              });
            }
          });
        }
      } catch (err) {
        this.logger.warn(`Could not merge Cloudinary CDN resources into gallery list: ${err}`);
      }
    }

    const total = items.length > dbResult.total ? items.length : dbResult.total;
    const totalPages = Math.ceil(total / limit) || 1;

    const result = {
      items,
      total,
      page: dbResult.page,
      limit: dbResult.limit,
      totalPages,
      hasNextPage: dbResult.hasNextPage,
      hasPrevPage: dbResult.hasPrevPage,
    };

    try {
      this.cacheKeys.add(cacheKey);
      await this.cacheManager.set(cacheKey, result, 60 * 1000);
    } catch {
      // ignore
    }

    return result;
  }

  async findOne(id: string) {
    if (id.startsWith('cdn-')) {
      const cdnResources = await this.uploadsService.getCloudinaryResources();
      const rawId = id.replace(/^cdn-/, '');
      const found = cdnResources.find((r: any) => r.id === rawId || r.url.includes(rawId));
      if (found) {
        const rawCat = found.category || 'General';
        const lowerCat = rawCat.toLowerCase();
        const lowerUrl = (found.url || '').toLowerCase();
        const isOthers = lowerCat === 'others' || lowerCat === 'other' || lowerCat.includes('visual editor') || lowerUrl.includes('/others/');
        const isAlbum = lowerCat.startsWith('album/') || lowerCat === 'album' || lowerUrl.includes('/album/');
        let albumName = rawCat;
        let directory = rawCat;
        let eventType = rawCat;

        if (isOthers) {
          albumName = 'Others';
          directory = 'Others';
          eventType = 'Others';
        } else if (lowerCat === 'home' || lowerUrl.includes('/settings/home')) {
          directory = 'Settings/Home';
          eventType = 'Home';
          albumName = 'Home';
        } else if (lowerCat === 'popupbanner' || lowerUrl.includes('popup')) {
          directory = 'Others';
          eventType = 'Others';
          albumName = 'Others';
        } else if (lowerCat === 'news' || lowerUrl.includes('/press')) {
          directory = 'PressRelease';
          eventType = 'PressRelease';
          albumName = 'PressRelease';
        } else if (lowerCat === 'student' || lowerUrl.includes('/student/')) {
          directory = 'Student';
          eventType = 'Student';
          albumName = 'Student';
        } else if (lowerCat === 'staff' || lowerUrl.includes('/staff/')) {
          directory = 'Staff';
          eventType = 'Staff';
          albumName = 'Staff';
        } else if (lowerCat === 'videos' || lowerUrl.includes('/videos/')) {
          directory = 'Videos';
          eventType = 'Videos';
          albumName = 'Videos';
        } else if (lowerCat.startsWith('documents') || lowerUrl.includes('/documents/')) {
          directory = lowerCat.includes('admission') ? 'Documents/Admission' : 'Documents/General';
          eventType = 'Documents';
          albumName = 'Documents';
        } else if (isAlbum) {
          directory = lowerCat.startsWith('album/') ? rawCat : `Album/${rawCat}`;
          albumName = lowerCat.startsWith('album/') ? rawCat.slice('album/'.length) : rawCat;
          eventType = albumName;
        }

        return {
          _id: id,
          id,
          eventName: found.title || (isOthers ? 'Others Asset' : 'Cloudinary Asset'),
          album: albumName,
          eventType,
          directory,
          fileUrl: [found.url],
          mimeType: (found as any).mimeType || (found.format === 'pdf' ? 'application/pdf' : found.resourceType === 'video' ? `video/${found.format || 'mp4'}` : `image/${found.format || 'jpeg'}`),
          isCdnResource: true,
        };
      }
    }
    const item = await this.galleryRepository.findById(id);
    if (item) {
      const doc = (item as any).toObject ? (item as any).toObject() : item;
      doc.directory = inferDirectoryFromItem(doc.directory, doc.fileUrl, doc.album, doc.eventType);
      doc.album = extractAlbumName(doc.album, doc.directory, doc.eventType);
      return doc;
    }
    return item;
  }

  async update(id: string, updateGalleryDto: UpdateGalleryDto) {
    try {
      if (updateGalleryDto.eventName) {
        updateGalleryDto.eventName = formatPrettyEventName(updateGalleryDto.eventName);
      }
      if (!updateGalleryDto.album && (updateGalleryDto.directory || updateGalleryDto.eventType)) {
        updateGalleryDto.album = extractAlbumName(undefined, updateGalleryDto.directory, updateGalleryDto.eventType);
      }
      if (updateGalleryDto.album && (!updateGalleryDto.directory || updateGalleryDto.directory === '/album/General')) {
        const alb = updateGalleryDto.album;
        updateGalleryDto.directory = alb.toLowerCase() === 'others' ? 'Others' : `Album/${alb}`;
      }
      if (Array.isArray(updateGalleryDto.fileUrl)) {
        updateGalleryDto.fileUrl = updateGalleryDto.fileUrl.map(u => cleanAssetPath(u));
      }
      if ((updateGalleryDto as any).url) {
        (updateGalleryDto as any).url = cleanAssetPath((updateGalleryDto as any).url);
      }
      if (id.startsWith('cdn-')) {
        // Upsert into MongoDB so updates/metadata changes persist
        const rawAlbum = updateGalleryDto.album || extractAlbumName(undefined, updateGalleryDto.directory, updateGalleryDto.eventType);
        const isOthers = rawAlbum.toLowerCase() === 'others' || (updateGalleryDto.eventType || '').toLowerCase().includes('visual editor');
        const defaultDir = isOthers ? 'Others' : `Album/${rawAlbum}`;
        const created = await this.galleryRepository.create({
          eventName: updateGalleryDto.eventName || (isOthers ? 'Others Asset' : 'Cloudinary Asset'),
          album: isOthers ? 'Others' : rawAlbum,
          eventType: isOthers ? 'Others' : (updateGalleryDto.eventType || rawAlbum),
          directory: updateGalleryDto.directory || defaultDir,
          fileUrl: updateGalleryDto.fileUrl || [],
          mimeType: updateGalleryDto.mimeType,
        });
        return created;
      }

      try {
        if (updateGalleryDto.fileUrl && Array.isArray(updateGalleryDto.fileUrl)) {
          const existing = await this.galleryRepository.findById(id);
          if (existing && Array.isArray(existing.fileUrl)) {
            const newUrls = new Set(updateGalleryDto.fileUrl);
            const removedUrls = existing.fileUrl.filter((url) => !newUrls.has(url));
            for (const url of removedUrls) {
              await this.uploadsService.deleteFileByUrl(url, true);
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Could not perform Cloudinary cleanup on update for ${id}: ${err}`);
      }

      const updated = await this.galleryRepository.update(id, updateGalleryDto);
      return updated;
    } finally {
      await this.invalidateGalleryCache();
    }
  }

  async remove(id: string) {
    try {
      // If id is a cdn- ID or direct Cloudinary key/URL
      if (id.startsWith('cdn-') || id.includes('http') || id.includes('/')) {
        let targetUrl = id.replace(/^cdn-/, '');
        const filename = targetUrl.split('/').pop() || '';

        // Check if DB record exists for this item
        const searchConditions: any[] = [{ fileUrl: targetUrl }, { fileUrl: `/${targetUrl}` }];
        if (filename) {
          searchConditions.push({ fileUrl: { $regex: filename, $options: 'i' } });
        }

        const existing = await this.galleryRepository.findAll(
          { page: 1, limit: 10 },
          [],
          { $or: searchConditions },
        );
        const items = existing.items || (existing as any).data || [];

        for (const doc of items) {
          const docId = (doc as any)._id || (doc as any).id;
          if (docId) {
            try {
              await this.galleryRepository.delete(String(docId));
            } catch {}
          }
        }

        // Delete directly from Cloudinary CDN storage (skip duplicate gallery cleanup)
        await this.uploadsService.deleteFileByUrl(targetUrl, true);
        return { deleted: true, id };
      }

      // Standard MongoDB ObjectId / publicId removal
      try {
        const existing = await this.galleryRepository.findById(id);
        if (existing && Array.isArray(existing.fileUrl)) {
          for (const url of existing.fileUrl) {
            // Pass skipGalleryCleanup = true so uploadsService does NOT delete the document before we do!
            await this.uploadsService.deleteFileByUrl(url, true);
          }
        }
      } catch (err) {
        this.logger.warn(`Could not perform Cloudinary cleanup on delete for ${id}: ${err}`);
      }

      try {
        const deleted = await this.galleryRepository.delete(id);
        return deleted;
      } catch (err: any) {
        // If it was already deleted concurrently or by another process, treat as success
        if (err?.status === 404 || err?.name === 'NotFoundException' || String(err?.message || '').includes('not found')) {
          return { deleted: true, id };
        }
        throw err;
      }
    } finally {
      // ALWAYS invalidate related gallery and uploads caches on ANY delete!
      await this.invalidateGalleryCache();
    }
  }
}

