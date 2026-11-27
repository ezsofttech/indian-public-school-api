import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { SchoolSettingRepository } from './school-setting.repository';
import { UpdateSchoolSettingDto } from './dto/update-school-setting.dto';
import { UpdatePartialSettingDto } from './dto/update-partial-setting.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { transformMediaUrlsToRelative } from '../uploads/utils';

@Injectable()
export class SchoolSettingsService implements OnModuleInit {
  constructor(
    private readonly schoolSettingRepository: SchoolSettingRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async onModuleInit() {
    try {
      const active = await this.schoolSettingRepository.findActive();
      if (active && (!active.status || active.status !== 'Active')) {
        await this.schoolSettingRepository.update(active._id.toString(), { status: 'Active' });
      }
    } catch (err) {
      console.warn('[SchoolSettingsService.onModuleInit] Warning:', err);
    }
  }

  async findAll(queryDto: PaginationQueryDto = {}, category?: string, status?: string) {
    const additionalFilter: Record<string, any> = {
      key: { $nin: ['site_logo', 'certified_board', 'trust_board', 'academic_partner'] },
    };
    if (category && category !== 'All') additionalFilter.category = category;
    if (status && status !== 'All') {
      const st = String(status).toLowerCase();
      additionalFilter.status = st === 'active' ? 'Active' : st === 'inactive' ? 'Inactive' : status;
    }

    return this.schoolSettingRepository.findAll(
      queryDto,
      ['key', 'category', 'description'],
      additionalFilter,
    );
  }

  async findActiveSetting() {
    const cacheKey = 'active_school_setting';
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const res = await this.schoolSettingRepository.findActive();
    if (res) {
      try {
        await this.cacheManager.set(cacheKey, res, 60 * 1000);
      } catch {
        // ignore
      }
    }
    return res;
  }

  async update(id: string, dto: UpdateSchoolSettingDto) {
    const current = await this.schoolSettingRepository.findById(id);
    if (dto.status && dto.status.toLowerCase() === 'active' && current?.key !== 'site_datasource') {
      const cat = dto.category || current?.category;
      await this.schoolSettingRepository.deactivateOthers(id, cat);
    }
    const result = await this.schoolSettingRepository.update(id, dto);
    const key = current?.key || dto.key;

    try {
      await this.cacheManager.del('site_datasource');
      await this.cacheManager.del('active_school_setting');
      if (key) {
        await this.cacheManager.del(`setting_key_${key}`);
      }
    } catch {
      // ignore
    }

    return result;
  }

  async remove(id: string) {
    const current = await this.schoolSettingRepository.findById(id);
    const key = current?.key;
    try {
      await this.cacheManager.del('site_datasource');
      await this.cacheManager.del('active_school_setting');
      if (key) {
        await this.cacheManager.del(`setting_key_${key}`);
      }
    } catch {
      // ignore
    }
    return this.schoolSettingRepository.delete(id);
  }

  async getDatasource(): Promise<Record<string, unknown>> {
    const cacheKey = 'site_datasource';
    try {
      const nestCached = await this.cacheManager.get<Record<string, unknown>>(cacheKey);
      if (nestCached && Object.keys(nestCached).length > 0) {
        return nestCached;
      }
    } catch {
      // continue to fetch from database if cache lookup fails
    }

    let datasource: Record<string, unknown> = {};
    try {
      const setting: any = await this.findActiveSetting();
      const value = setting?.value;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        datasource = { ...(value as Record<string, unknown>) };
      }
    } catch {
      datasource = {};
    }

    if (datasource && Object.keys(datasource).length > 0) {
      try {
        await this.cacheManager.set(cacheKey, datasource, 60 * 1000);
      } catch {
        // ignore
      }
    }

    return datasource;
  }

  resolveSectionPath(sectionKey: string): { mongoPath: string; isHomeSection: boolean; canonicalKey: string } {
    const keyMap: Record<string, { mongoPath: string; isHomeSection: boolean; canonicalKey: string }> = {
      // Root sections
      site_logo: { mongoPath: 'value.site_logo', isHomeSection: false, canonicalKey: 'site_logo' },
      header: { mongoPath: 'value.header', isHomeSection: false, canonicalKey: 'header' },
      footer: { mongoPath: 'value.footer', isHomeSection: false, canonicalKey: 'footer' },
      whatsapp: { mongoPath: 'value.whatsapp', isHomeSection: false, canonicalKey: 'whatsapp' },
      popupBanner: { mongoPath: 'value.popupBanner', isHomeSection: false, canonicalKey: 'popupBanner' },
      certified_board: { mongoPath: 'value.certified_board', isHomeSection: false, canonicalKey: 'certified_board' },
      trust_board: { mongoPath: 'value.trust_board', isHomeSection: false, canonicalKey: 'trust_board' },
      academic_partner: { mongoPath: 'value.academic_partner', isHomeSection: false, canonicalKey: 'academic_partner' },
      aboutUs: { mongoPath: 'value.aboutUs', isHomeSection: false, canonicalKey: 'aboutUs' },

      // Home sections
      hero: { mongoPath: 'value.home.0.hero', isHomeSection: true, canonicalKey: 'hero' },
      quickCards: { mongoPath: 'value.home.0.menuCard', isHomeSection: true, canonicalKey: 'menuCard' },
      menuCard: { mongoPath: 'value.home.0.menuCard', isHomeSection: true, canonicalKey: 'menuCard' },
      video: { mongoPath: 'value.home.0.section-video', isHomeSection: true, canonicalKey: 'section-video' },
      'section-video': { mongoPath: 'value.home.0.section-video', isHomeSection: true, canonicalKey: 'section-video' },
      sec1: { mongoPath: 'value.home.0.section-1', isHomeSection: true, canonicalKey: 'section-1' },
      'section-1': { mongoPath: 'value.home.0.section-1', isHomeSection: true, canonicalKey: 'section-1' },
      sec2: { mongoPath: 'value.home.0.section-2', isHomeSection: true, canonicalKey: 'section-2' },
      'section-2': { mongoPath: 'value.home.0.section-2', isHomeSection: true, canonicalKey: 'section-2' },
      sec3: { mongoPath: 'value.home.0.section-3', isHomeSection: true, canonicalKey: 'section-3' },
      'section-3': { mongoPath: 'value.home.0.section-3', isHomeSection: true, canonicalKey: 'section-3' },
      sec4: { mongoPath: 'value.home.0.section-4', isHomeSection: true, canonicalKey: 'section-4' },
      'section-4': { mongoPath: 'value.home.0.section-4', isHomeSection: true, canonicalKey: 'section-4' },
      sec5: { mongoPath: 'value.home.0.section-5', isHomeSection: true, canonicalKey: 'section-5' },
      'section-5': { mongoPath: 'value.home.0.section-5', isHomeSection: true, canonicalKey: 'section-5' },
      sec6: { mongoPath: 'value.home.0.section-6', isHomeSection: true, canonicalKey: 'section-6' },
      'section-6': { mongoPath: 'value.home.0.section-6', isHomeSection: true, canonicalKey: 'section-6' },
      sec7: { mongoPath: 'value.home.0.section-7', isHomeSection: true, canonicalKey: 'section-7' },
      'section-7': { mongoPath: 'value.home.0.section-7', isHomeSection: true, canonicalKey: 'section-7' },
      sec8: { mongoPath: 'value.home.0.section-8', isHomeSection: true, canonicalKey: 'section-8' },
      'section-8': { mongoPath: 'value.home.0.section-8', isHomeSection: true, canonicalKey: 'section-8' },
      sec9: { mongoPath: 'value.home.0.section-9', isHomeSection: true, canonicalKey: 'section-9' },
      'section-9': { mongoPath: 'value.home.0.section-9', isHomeSection: true, canonicalKey: 'section-9' },
      testimonials: { mongoPath: 'value.home.0.testimonials', isHomeSection: true, canonicalKey: 'testimonials' },
      faq: { mongoPath: 'value.home.0.faq', isHomeSection: true, canonicalKey: 'faq' },
    };

    if (keyMap[sectionKey]) {
      return keyMap[sectionKey];
    }

    return {
      mongoPath: `value.${sectionKey}`,
      isHomeSection: false,
      canonicalKey: sectionKey,
    };
  }

  async getSection(sectionKey: string) {
    const { isHomeSection, canonicalKey } = this.resolveSectionPath(sectionKey);
    const ds = await this.getDatasource();
    let data: any = null;
    if (isHomeSection) {
      const homeList = Array.isArray(ds?.home) ? (ds.home as any[]) : [];
      const firstHome = homeList[0] || {};
      data = firstHome[canonicalKey] ?? null;
    } else {
      data = (ds as any)[canonicalKey] ?? null;
    }
    return {
      section: sectionKey,
      canonicalKey,
      data,
    };
  }

  async updatePartial(updates: UpdatePartialSettingDto | Record<string, any>) {
    if (!updates || typeof updates !== 'object') {
      return { success: false, message: 'Invalid updates object' };
    }

    // Support both direct map { hero: {...} }, { updates: {...} }, and { section: 'hero', value: {...} }
    const payload = updates.section && 'value' in updates
      ? { [updates.section]: updates.value }
      : (updates.updates && typeof updates.updates === 'object' ? updates.updates : updates);

    const setOps: Record<string, any> = {};
    const touchedKeys: string[] = [];

    for (const [key, val] of Object.entries(payload)) {
      // Sanitize any media URLs to clean relative paths so DB never stores absolute domain URLs
      const sanitizedVal = transformMediaUrlsToRelative(val);
      const { mongoPath, canonicalKey } = this.resolveSectionPath(key);
      setOps[mongoPath] = sanitizedVal;
      touchedKeys.push(canonicalKey, key);
      if (['header', 'footer', 'whatsapp', 'popupBanner'].includes(canonicalKey)) {
        setOps[`value.home.0.identity.${canonicalKey}`] = sanitizedVal;
      }
    }

    const result = await this.schoolSettingRepository.updatePartialByKey('site_datasource', setOps);

    try {
      await this.cacheManager.del('site_datasource');
      await this.cacheManager.del('site_datasource_key');
      await this.cacheManager.del('active_school_setting');
      for (const k of touchedKeys) {
        await this.cacheManager.del(`setting_key_${k}`);
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      updatedSections: Object.keys(payload),
      matchedCount: result?.matchedCount ?? 1,
      modifiedCount: result?.modifiedCount ?? 1,
    };
  }
}
