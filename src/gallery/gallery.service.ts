import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { GalleryRepository } from './gallery.repository';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UploadsService } from '../uploads/uploads.service';
import { formatPrettyEventName } from '../common/config';

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);

  constructor(
    private readonly galleryRepository: GalleryRepository,
    @Inject(forwardRef(() => UploadsService))
    private readonly uploadsService: UploadsService,
  ) {}

  async create(createGalleryDto: CreateGalleryDto) {
    if (createGalleryDto.eventName) {
      createGalleryDto.eventName = formatPrettyEventName(createGalleryDto.eventName);
    }
    if (createGalleryDto.fileUrl && createGalleryDto.fileUrl.length > 0) {
      const existing = await this.galleryRepository.findAll(
        { page: 1, limit: 10 },
        [],
        { fileUrl: { $in: createGalleryDto.fileUrl } },
      );
      const items = existing.items || (existing as any).data || [];
      if (items.length > 0) {
        const autoUploadDoc = items.find((doc: any) => {
          const name = String(doc.eventName || '');
          return name.match(/\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i) || doc.eventType === 'General' || doc.eventType === 'Gallery';
        });
        if (autoUploadDoc) {
          const docId = (autoUploadDoc as any)._id || (autoUploadDoc as any).id;
          return this.galleryRepository.update(String(docId), createGalleryDto);
        }
      }
    }
    return this.galleryRepository.create(createGalleryDto);
  }

  async findAll(queryDto: PaginationQueryDto = {}, eventType?: string, directory?: string) {
    const page = Math.max(1, Number(queryDto.page) || 1);
    const limit = Math.max(1, Math.min(500, Number(queryDto.limit) || 10));
    const search = (queryDto.search || '').trim().toLowerCase();

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
    const sortOrder = String(queryDto.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    // 1. Fetch ALL DB items from MongoDB (unpaginated)
    const dbResult = await this.galleryRepository.findAll(
      { page: 1, limit: 10000 },
      [],
      {},
    );
    const dbItems = dbResult.items || (dbResult as any).data || [];

    // 2. Map DB file URLs and assign fallbacks for records without images
    const dbUrls = new Set<string>();
    const DEFAULT_FALLBACK_IMAGES = [
      "/Settings/Home/hero-campus.jpg",
      "https://images.unsplash.com/photo-1562774053-701939374585?w=1200&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1577896851231-70ef18881754?w=1200&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200&auto=format&fit=crop&q=80",
      "/Settings/Home/Banner_1.jpg",
      "/Settings/Home/Banner_2.jpg",
      "/Settings/Home/Banner_3.jpg",
      "/Settings/Home/Banner_4.jpg",
      "/Settings/Home/Banner_5.jpg",
      "/Settings/Home/Banner_6.jpg",
      "/Settings/Home/Banner_7.jpg",
      "/Settings/Home/Banner_8.jpg",
    ];

    dbItems.forEach((item: any, idx: number) => {
      let urls = Array.isArray(item.fileUrl)
        ? item.fileUrl
        : typeof item.fileUrl === 'string' && item.fileUrl.trim()
        ? [item.fileUrl]
        : [];

      if (urls.length === 0) {
        const fallbackUrl = DEFAULT_FALLBACK_IMAGES[idx % DEFAULT_FALLBACK_IMAGES.length];
        item.fileUrl = [fallbackUrl];
        urls = [fallbackUrl];
      }

      urls.forEach((u: string) => {
        if (u) {
          const trimmed = u.trim();
          dbUrls.add(trimmed);
          const filename = trimmed.split('/').pop();
          if (filename) dbUrls.add(filename);
        }
      });
    });

    // 3. Fetch direct Cloudinary CDN resources
    let cdnResources: any[] = [];
    try {
      cdnResources = await this.uploadsService.getCloudinaryResources();
    } catch (err) {
      this.logger.warn(`Could not fetch Cloudinary CDN resources for gallery list: ${err}`);
    }

    // 4. Convert Cloudinary assets not yet in DB into virtual Gallery entries
    const virtualItems: any[] = [];
    (Array.isArray(cdnResources) ? cdnResources : []).forEach((res: any, idx: number) => {
      const resUrl = (res.url || '').trim();
      const resId = (res.id || '').trim();
      const filename = resUrl.split('/').pop();

      const existsInDb =
        (resUrl && dbUrls.has(resUrl)) ||
        (resId && dbUrls.has(resId)) ||
        (filename && dbUrls.has(filename));

      if (!existsInDb) {
        const cat = res.category || 'General';
        const dirPath = cat.includes('/') || cat.startsWith('/')
          ? cat
          : `/album/${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        virtualItems.push({
          _id: `cdn-${res.id || idx}`,
          id: `cdn-${res.id || idx}`,
          publicId: res.id || `cdn-${idx}`,
          eventName: res.title || cat,
          eventType: cat,
          directory: dirPath,
          fileUrl: [res.url],
          mimeType: res.mimeType || (res.format === 'pdf' ? 'application/pdf' : res.resourceType === 'video' ? `video/${res.format || 'mp4'}` : `image/${res.format || 'jpeg'}`),
          isCdnResource: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    // 4b. Ensure complete media suite with default sample assets
    const DEFAULT_MEDIA_ITEMS = [
      { eventName: "Main Campus Aerial View", eventType: "Campus", directory: "/album/campus", fileUrl: ["/Settings/Home/hero-campus.jpg"] },
      { eventName: "School Academic Infrastructure", eventType: "Campus", directory: "/album/campus", fileUrl: ["https://images.unsplash.com/photo-1562774053-701939374585?w=1200&auto=format&fit=crop&q=80"] },
      { eventName: "Smart Science & Innovation Lab", eventType: "Activities", directory: "/album/activities", fileUrl: ["https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&auto=format&fit=crop&q=80"] },
      { eventName: "Digital Smart Interactive Classroom", eventType: "Campus", directory: "/album/campus", fileUrl: ["https://images.unsplash.com/photo-1577896851231-70ef18881754?w=1200&auto=format&fit=crop&q=80"] },
      { eventName: "Central Library & Knowledge Hub", eventType: "Campus", directory: "/album/campus", fileUrl: ["https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200&auto=format&fit=crop&q=80"] },
      { eventName: "School Entrance & Reception", eventType: "Banners", directory: "/album/banners", fileUrl: ["/Settings/Home/Banner_1.jpg"] },
      { eventName: "Annual Athletic Sports Field", eventType: "Sports", directory: "/album/sports", fileUrl: ["/Settings/Home/Banner_2.jpg"] },
      { eventName: "Cultural Festival Stage", eventType: "Events", directory: "/album/events", fileUrl: ["/Settings/Home/Banner_3.jpg"] },
      { eventName: "Co-Curricular Student Center", eventType: "Activities", directory: "/album/activities", fileUrl: ["/Settings/Home/Banner_4.jpg"] },
      { eventName: "Computer Science Center", eventType: "Campus", directory: "/album/campus", fileUrl: ["/Settings/Home/Banner_7.jpg"] },
      { eventName: "Art & Craft Studio", eventType: "Arts", directory: "/album/arts", fileUrl: ["/Settings/Home/Banner_6.jpg"] },
      { eventName: "Hostel Premises", eventType: "Hostel", directory: "/album/hostel", fileUrl: ["/Settings/Home/Banner_7.jpg"] },
      { eventName: "Open Green Playgrounds", eventType: "Sports", directory: "/album/sports", fileUrl: ["/Settings/Home/Banner_8.jpg"] },
    ];

    DEFAULT_MEDIA_ITEMS.forEach((item, idx) => {
      const u = item.fileUrl[0];
      if (u && !dbUrls.has(u)) {
        dbUrls.add(u);
        virtualItems.push({
          _id: `default-${idx}`,
          id: `default-${idx}`,
          publicId: `default-${idx}`,
          eventName: item.eventName,
          eventType: item.eventType,
          directory: item.directory,
          fileUrl: item.fileUrl,
          isCdnResource: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    // 5. Combine DB records and virtual CDN records into complete dataset
    let combined = [...dbItems, ...virtualItems];

    // 6. Apply case-insensitive eventType filter
    if (activeEventType && activeEventType.toLowerCase() !== 'all') {
      combined = combined.filter((item: any) => {
        const itemType = String(item.eventType || '').trim().toLowerCase();
        return itemType === activeEventType.toLowerCase();
      });
    }

    // 6b. Apply case-insensitive directory filter
    if (activeDirectory && activeDirectory.toLowerCase() !== 'all') {
      const targetDir = activeDirectory.trim().toLowerCase();
      combined = combined.filter((item: any) => {
        const itemDir = String(item.directoryName || item.directory || '').trim().toLowerCase();
        const itemUrls = Array.isArray(item.fileUrl) ? item.fileUrl : [item.fileUrl];
        return itemDir.includes(targetDir) || targetDir.includes(itemDir) || itemUrls.some((u: string) => String(u).toLowerCase().includes(targetDir));
      });
    }

    // 7. Apply case-insensitive search across eventName, eventType, directory, publicId, and fileUrl
    if (search) {
      combined = combined.filter((item: any) => {
        const nameMatch = String(item.eventName || '').toLowerCase().includes(search);
        const typeMatch = String(item.eventType || '').toLowerCase().includes(search);
        const dirMatch = String(item.directoryName || item.directory || '').toLowerCase().includes(search);
        const publicIdMatch = String(item.publicId || item._id || item.id || '').toLowerCase().includes(search);
        const urlMatch = Array.isArray(item.fileUrl) && item.fileUrl.some((u: string) => String(u).toLowerCase().includes(search));
        return nameMatch || typeMatch || dirMatch || publicIdMatch || urlMatch;
      });
    }

    // 8. Apply sorting
    combined.sort((a: any, b: any) => {
      let valA = a[sortBy] ?? a.createdAt ?? '';
      let valB = b[sortBy] ?? b.createdAt ?? '';
      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 1 ? -1 : 1;
      if (valA > valB) return sortOrder === 1 ? 1 : -1;
      return 0;
    });

    // 9. Apply final pagination on complete dataset
    const total = combined.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const items = combined.slice(skip, skip + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async findOne(id: string) {
    if (id.startsWith('cdn-')) {
      const cdnResources = await this.uploadsService.getCloudinaryResources();
      const rawId = id.replace(/^cdn-/, '');
      const found = cdnResources.find((r: any) => r.id === rawId || r.url.includes(rawId));
      if (found) {
        return {
          _id: id,
          id,
          eventName: found.title || 'Cloudinary Asset',
          eventType: found.category || 'General',
          directory: `/album/${(found.category || 'General').toLowerCase()}`,
          fileUrl: [found.url],
          mimeType: (found as any).mimeType || (found.format === 'pdf' ? 'application/pdf' : found.resourceType === 'video' ? `video/${found.format || 'mp4'}` : `image/${found.format || 'jpeg'}`),
          isCdnResource: true,
        };
      }
    }
    return this.galleryRepository.findById(id);
  }

  async update(id: string, updateGalleryDto: UpdateGalleryDto) {
    if (updateGalleryDto.eventName) {
      updateGalleryDto.eventName = formatPrettyEventName(updateGalleryDto.eventName);
    }
    if (id.startsWith('cdn-')) {
      // Upsert into MongoDB so updates/metadata changes persist
      return this.galleryRepository.create({
        eventName: updateGalleryDto.eventName || 'Cloudinary Asset',
        eventType: updateGalleryDto.eventType || 'General',
        directory: updateGalleryDto.directory || `/album/${(updateGalleryDto.eventType || 'General').toLowerCase()}`,
        fileUrl: updateGalleryDto.fileUrl || [],
        mimeType: updateGalleryDto.mimeType,
      });
    }

    try {
      if (updateGalleryDto.fileUrl && Array.isArray(updateGalleryDto.fileUrl)) {
        const existing = await this.galleryRepository.findById(id);
        if (existing && Array.isArray(existing.fileUrl)) {
          const newUrls = new Set(updateGalleryDto.fileUrl);
          const removedUrls = existing.fileUrl.filter((url) => !newUrls.has(url));
          for (const url of removedUrls) {
            await this.uploadsService.deleteFileByUrl(url);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not perform Cloudinary cleanup on update for ${id}: ${err}`);
    }

    return this.galleryRepository.update(id, updateGalleryDto);
  }

  async remove(id: string) {
    // If id is a cdn- ID or direct Cloudinary key/URL
    if (id.startsWith('cdn-') || id.includes('http') || id.includes('/')) {
      let targetUrl = id.replace(/^cdn-/, '');

      // Check if DB record exists for this item
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

      // Delete directly from Cloudinary CDN storage
      await this.uploadsService.deleteFileByUrl(targetUrl);
      return { deleted: true, id };
    }

    // Standard MongoDB ObjectId removal
    try {
      const existing = await this.galleryRepository.findById(id);
      if (existing && Array.isArray(existing.fileUrl)) {
        for (const url of existing.fileUrl) {
          await this.uploadsService.deleteFileByUrl(url);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not perform Cloudinary cleanup on delete for ${id}: ${err}`);
    }

    return this.galleryRepository.delete(id);
  }
}

