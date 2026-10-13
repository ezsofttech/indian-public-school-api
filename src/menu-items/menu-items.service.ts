import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { MenuItemsRepository } from './menu-items.repository';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuItemsService {
  private cacheKeys = new Set<string>();

  constructor(
    private readonly repo: MenuItemsRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async invalidateMenuCache() {
    try {
      for (const key of this.cacheKeys) {
        await this.cacheManager.del(key);
      }
      this.cacheKeys.clear();
    } catch {
      // ignore
    }
  }

  async create(createDto: CreateMenuItemDto) {
    const res = await this.repo.create(createDto);
    await this.invalidateMenuCache();
    return res;
  }

  async findAll(
    options?:
      | {
          category?: string;
          publishedOnly?: boolean | string;
          search?: string;
          page?: number;
          limit?: number;
          flat?: boolean | string;
          sortBy?: string;
          sortOrder?: string;
        }
      | string,
    publishedOnly = false,
  ) {
    const cacheKey = `menu_items_${JSON.stringify(options || {})}_${publishedOnly}`;
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const res = await this.repo.findAll(options, publishedOnly);
    try {
      this.cacheKeys.add(cacheKey);
      await this.cacheManager.set(cacheKey, res, 60 * 1000);
    } catch {
      // ignore
    }
    return res;
  }

  findOne(id: string) {
    return this.repo.findOne(id);
  }

  async update(id: string, updateDto: UpdateMenuItemDto) {
    const res = await this.repo.update(id, updateDto);
    await this.invalidateMenuCache();
    return res;
  }

  async remove(id: string) {
    const res = await this.repo.remove(id);
    await this.invalidateMenuCache();
    return res;
  }

  async seedDefaultMenuItems() {
    await this.repo.deleteLegacySubMenus();

    // 1. Root Level 1 Menu Items
    const rootNav: CreateMenuItemDto[] = [
      { menuId: 'home', title: 'Home', slug: 'home', targetUrl: '/', category: 'Header', order: 1, icon: 'Home' },
      { menuId: 'about', title: 'About Us', slug: 'about', targetUrl: '/about', category: 'Header', order: 2, icon: 'Building' },
      { menuId: 'academics', title: 'Academics', slug: 'academics', targetUrl: '/pages/academics', category: 'Header', order: 3, icon: 'BookOpen' },
      { menuId: 'admissions', title: 'Admissions', slug: 'admissions', targetUrl: '/admission', category: 'Header', order: 4, icon: 'FileText' },
      { menuId: 'campus-life', title: 'Campus Life', slug: 'campus-life', targetUrl: '/pages/beyond-classroom', category: 'Header', order: 5, icon: 'Users' },
      { menuId: 'infrastructure', title: 'Infrastructure', slug: 'infrastructure', targetUrl: '/pages/infrastructure', category: 'Header', order: 6, icon: 'Trees' },
      { menuId: 'news', title: 'Media & News', slug: 'news', targetUrl: '/news', category: 'Header', order: 7, icon: 'Newspaper' },
      { menuId: 'other', title: 'Other Links', slug: 'other', targetUrl: '/other', category: 'Header', order: 8, icon: 'Link' },
      { menuId: 'contact', title: 'Contact Us', slug: 'contact-us', targetUrl: '/contact-us', category: 'Header', order: 9, icon: 'Phone' },
    ];

    for (const item of rootNav) {
      await this.repo.upsertOne(item);
    }

    // 2. Level 2 Sub Menu Items
    const subNav: CreateMenuItemDto[] = [
      // About Us sub-items
      { menuId: 'sub-chairman', parentId: 'about', title: "Chairman's Message", slug: 'chairman-message', targetUrl: '/about/chairman-message', category: 'Header', order: 1 },
      { menuId: 'sub-director', parentId: 'about', title: "Director's Message", slug: 'director-message', targetUrl: '/about/director-message', category: 'Header', order: 2 },
      { menuId: 'sub-principal', parentId: 'about', title: "Principal's Desk", slug: 'principal-message', targetUrl: '/about/principal-message', category: 'Header', order: 3 },
      { menuId: 'sub-mission', parentId: 'about', title: 'Mission & Vision', slug: 'mission-vision', targetUrl: '/about/mission-vision', category: 'Header', order: 4 },
      { menuId: 'sub-establishment', parentId: 'about', title: 'School Establishment', slug: 'establishment', targetUrl: '/about/establishment', category: 'Header', order: 5 },

      // Academics sub-items
      { menuId: 'sub-curriculum', parentId: 'academics', title: 'Curriculum & Streams', slug: 'curriculum', targetUrl: '/admissions/curriculum', category: 'Header', order: 1 },
      { menuId: 'sub-stream-allocation', parentId: 'academics', title: 'Stream Allocation', slug: 'stream-allocation', targetUrl: '/academics/stream-allocation', category: 'Header', order: 2 },
      { menuId: 'sub-social-learning', parentId: 'academics', title: 'Social Learning', slug: 'social-learning', targetUrl: '/academics/social-learning', category: 'Header', order: 3 },

      // Admissions sub-items
      { menuId: 'sub-policy', parentId: 'admissions', title: 'Admission Policy', slug: 'policy', targetUrl: '/admissions/policy', category: 'Header', order: 1 },
      { menuId: 'sub-prospectus', parentId: 'admissions', title: 'Curriculum Prospectus', slug: 'prospectus-curriculum', targetUrl: '/admissions/curriculum', category: 'Header', order: 2 },

      // Campus Life sub-items
      { menuId: 'sub-houses', parentId: 'campus-life', title: 'Our Houses', slug: 'our-houses', targetUrl: '/life-at-ips/our-houses', category: 'Header', order: 1 },
      { menuId: 'sub-empowerment', parentId: 'campus-life', title: 'Student Empowerment', slug: 'student-empowerment', targetUrl: '/life-at-ips/student-empowerment', category: 'Header', order: 2 },
      { menuId: 'sub-ptm', parentId: 'campus-life', title: 'Parent-Teacher Meeting', slug: 'parent-teacher-meeting', targetUrl: '/connectivity/parent-teacher-meeting', category: 'Header', order: 3 },
      { menuId: 'sub-societal', parentId: 'campus-life', title: 'Societal Engagement', slug: 'societal-engagement', targetUrl: '/connectivity/societal-engagement', category: 'Header', order: 4 },

      // Infrastructure sub-items
      { menuId: 'sub-laboratories', parentId: 'infrastructure', title: 'Science Laboratories', slug: 'laboratories', targetUrl: '/infrastructure/laboratories', category: 'Header', order: 1 },
      { menuId: 'sub-hostels', parentId: 'infrastructure', title: 'Hostels & Dining', slug: 'hostels', targetUrl: '/infrastructure/hostels', category: 'Header', order: 2 },
      { menuId: 'sub-sports', parentId: 'infrastructure', title: 'Sports Grounds', slug: 'sports-room', targetUrl: '/infrastructure/sports-room', category: 'Header', order: 3 },
      { menuId: 'sub-art-craft', parentId: 'infrastructure', title: 'Art & Craft Studio', slug: 'art-craft', targetUrl: '/infrastructure/art-craft', category: 'Header', order: 4 },
      { menuId: 'sub-music-dance', parentId: 'infrastructure', title: 'Music & Performing Arts', slug: 'music-dance', targetUrl: '/infrastructure/music-dance', category: 'Header', order: 5 },
      { menuId: 'sub-school-building', parentId: 'infrastructure', title: 'School Building', slug: 'school-building', targetUrl: '/infrastructure/school-building', category: 'Header', order: 6 },

      // News & Careers sub-items
      { menuId: 'sub-press-release', parentId: 'news', title: 'Press Release', slug: 'press-release', targetUrl: '/press-release', category: 'Header', order: 1 },
      { menuId: 'sub-openings', parentId: 'careers', title: 'Staff Openings', slug: 'careers-openings', targetUrl: '/careers', category: 'Header', order: 1 },
    ];

    for (const item of subNav) {
      await this.repo.upsertOne(item);
    }

    await this.invalidateMenuCache();
    return this.repo.findAll();
  }
}
