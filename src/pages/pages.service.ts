import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PagesRepository } from './pages.repository';

@Injectable()
export class PagesService implements OnModuleInit {
  private cacheKeys = new Set<string>();

  constructor(
    private readonly pagesRepository: PagesRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) { }

  async onModuleInit() {
    // Note: Auto-seeding default pages disabled so everything is controlled from DB.
  }

  async seedDefaultPages() {
    try {
      const homeHtml = `<section style="margin-bottom: 2.5rem;">
  <h2 style="font-size: 1.875rem; font-weight: 700; color: #102a4c; margin-bottom: 0.5rem;">About Our School</h2>
  <p style="font-size: 1.125rem; font-weight: 600; color: #1a5d9c; margin-bottom: 1rem;">Building Confident Learners for a Changing World</p>
  <p style="font-size: 1rem; color: #475569; line-height: 1.7; margin-bottom: 1rem;">
    Indian Public School is a co-educational CBSE school where academic rigour meets genuine care. Our classrooms are designed for enquiry rather than repetition, and our teachers know every child by name, strength and ambition.
  </p>
  <p style="font-size: 1rem; color: #475569; line-height: 1.7; margin-bottom: 1.5rem;">
    From the earliest years to senior secondary, students are guided to think clearly, speak confidently, collaborate generously and act with integrity.
  </p>
  
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
    <div style="border: 1px solid #e2e8f0; background-color: #f8fafc; padding: 1.25rem; border-radius: 1rem;">
      <h3 style="font-size: 1.25rem; font-weight: 700; color: #102a4c; margin-bottom: 0.5rem;">Our Mission</h3>
      <p style="font-size: 0.95rem; color: #64748b; line-height: 1.6;">To nurture curious, compassionate learners through excellent teaching, strong values and real opportunity for every child.</p>
    </div>
    <div style="border: 1px solid #e2e8f0; background-color: #f8fafc; padding: 1.25rem; border-radius: 1rem;">
      <h3 style="font-size: 1.25rem; font-weight: 700; color: #102a4c; margin-bottom: 0.5rem;">Our Vision</h3>
      <p style="font-size: 0.95rem; color: #64748b; line-height: 1.6;">To be a benchmark school recognised for academic depth, character development, innovation and inclusive community spirit.</p>
    </div>
  </div>
</section>`;

      const defaults = [
        {
          title: 'Home',
          slug: 'home',
          targetUrl: '/',
          textContent: homeHtml,
          order: 1,
          isPublished: true,
        },
        {
          title: 'About Us',
          slug: 'about',
          targetUrl: '/about',
          textContent: '<h1>About Our School</h1><p>Indian Public School is a co-educational CBSE school where academic rigour meets genuine care.</p>',
          order: 2,
          isPublished: true,
        },
        {
          title: 'Admission',
          slug: 'admission',
          targetUrl: '/admission',
          textContent: '<h1>Admissions & Enrolment</h1><p>Join the Indian Public School family. Admissions open for Session 2026-27.</p>',
          order: 3,
          isPublished: true,
        },
        {
          title: 'Notice & News',
          slug: 'news',
          targetUrl: '/news',
          textContent: '<h1>Notice Board & News</h1><p>Stay updated with latest announcements, circulars and campus news.</p>',
          order: 4,
          isPublished: true,
        },
        {
          title: 'Other Link',
          slug: 'other',
          targetUrl: '/other',
          textContent: '<h1>Other Important Links</h1><p>Quick access to school resources, guidelines and portals.</p>',
          order: 5,
          isPublished: true,
        },
      ];

      for (const item of defaults) {
        const existing = await this.pagesRepository.findBySlugOrId(item.slug);
        if (!existing) {
          await this.pagesRepository.create(item);
        } else if (item.slug === 'home') {
          await this.pagesRepository.update(String((existing as any)._id || (existing as any).id || existing.publicId), { textContent: homeHtml });
        }
      }
    } catch (err) {
      console.warn('[PagesService.seedDefaultPages] Skipped:', err);
    }
  }

  private generateSlug(title: string): string {
    return String(title || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private formatTargetUrl(targetUrl?: string, slug?: string): string {
    const raw = String(targetUrl || '').trim();
    if (raw) {
      if (raw.startsWith('/') || raw.startsWith('http')) return raw;
      return `/${raw}`;
    }
    return slug ? `/pages/${slug}` : '';
  }

  private async invalidatePagesCache() {
    try {
      for (const key of this.cacheKeys) {
        await this.cacheManager.del(key);
      }
      this.cacheKeys.clear();
      await this.cacheManager.del('pages_published_all');
    } catch {
      // ignore
    }
  }

  async create(createDto: CreatePageDto) {
    try {
      const payload: Record<string, any> = { ...createDto };

      if (!payload.slug && payload.title) {
        payload.slug = this.generateSlug(payload.title);
      }
      payload.targetUrl = this.formatTargetUrl(payload.targetUrl, payload.slug);

      const created = await this.pagesRepository.create(payload);
      await this.invalidatePagesCache();
      return created;
    } catch (err: any) {
      console.error('[PagesService.create Error]', err);
      throw err;
    }
  }

  async findPublishedAll(): Promise<any[]> {
    const cacheKey = 'pages_published_all';
    try {
      const cached = await this.cacheManager.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached)) return cached;
    } catch {
      // ignore
    }

    const pages = (await this.pagesRepository.findPublishedAll()) || [];
    try {
      this.cacheKeys.add(cacheKey);
      await this.cacheManager.set(cacheKey, pages, 60 * 1000);
    } catch {
      // ignore
    }
    return pages;
  }

  async findAll(queryDto: PaginationQueryDto = {}) {
    if (String((queryDto as any).all).toLowerCase() === 'true' || String((queryDto as any).limit).toLowerCase() === 'all') {
      const items: any[] = (await this.findPublishedAll()) || [];
      return {
        items,
        total: items.length,
        page: 1,
        limit: items.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    const additionalFilter: Record<string, any> = {};

    const isPubParam = (queryDto as any).isPublished;
    const filterKey = (queryDto as any).filterKey;
    const filterValue = (queryDto as any).filterValue;

    const rawStatus =
      isPubParam !== undefined && isPubParam !== ''
        ? isPubParam
        : filterKey === 'isPublished'
        ? filterValue
        : filterValue !== 'All'
        ? filterValue
        : undefined;

    if (rawStatus !== undefined && rawStatus !== '' && rawStatus !== 'All') {
      const lower = String(rawStatus).toLowerCase();
      if (lower === 'published' || lower === 'true' || lower === '1') {
        additionalFilter.isPublished = true;
      } else if (lower === 'draft' || lower === 'false' || lower === '0') {
        additionalFilter.isPublished = false;
      }
    }

    const effectiveQuery = { ...queryDto };
    if (!effectiveQuery.sortBy && !effectiveQuery.search) {
      effectiveQuery.sortBy = 'order';
      effectiveQuery.sortOrder = 'asc';
    }

    return this.pagesRepository.findAll(
      effectiveQuery,
      ['title', 'slug', 'targetUrl', 'textContent'],
      additionalFilter,
    );
  }

  async findOne(id: string) {
    return this.pagesRepository.findBySlugOrId(id);
  }

  async findBySlug(slug: string) {
    const cacheKey = `page_slug_${slug}`;
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const page = await this.pagesRepository.findBySlugOrId(slug);
    if (page) {
      try {
        this.cacheKeys.add(cacheKey);
        await this.cacheManager.set(cacheKey, page, 60 * 1000);
      } catch {
        // ignore
      }
    }
    return page;
  }

  async update(id: string, updateDto: UpdatePageDto) {
    try {
      const payload: Record<string, any> = { ...updateDto };

      if (!payload.slug && payload.title) {
        payload.slug = this.generateSlug(payload.title);
      }
      payload.targetUrl = this.formatTargetUrl(payload.targetUrl, payload.slug);

      const updated = await this.pagesRepository.update(id, payload);
      await this.invalidatePagesCache();
      return updated;
    } catch (err: any) {
      console.error('[PagesService.update Error]', err);
      throw err;
    }
  }

  async remove(id: string) {
    const res = await this.pagesRepository.delete(id);
    await this.invalidatePagesCache();
    return res;
  }
}




