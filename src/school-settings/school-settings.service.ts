import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { SchoolSettingRepository } from './school-setting.repository';
import { CreateSchoolSettingDto } from './dto/create-school-setting.dto';
import { UpdateSchoolSettingDto } from './dto/update-school-setting.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class SchoolSettingsService implements OnModuleInit {
  constructor(
    private readonly schoolSettingRepository: SchoolSettingRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async onModuleInit() {
    // Note: Auto-seeding disabled to ensure everything comes from DB and never overwrites user configurations.
    try {
      const active = await this.schoolSettingRepository.findActive();
      if (active && (!active.status || active.status !== 'Active')) {
        await this.schoolSettingRepository.update(active._id.toString(), { status: 'Active' });
      }
    } catch (err) {
      console.warn('[SchoolSettingsService.onModuleInit] Warning:', err);
    }
  }

  async seedSiteDatasource() {
    try {
      const existing = await this.schoolSettingRepository.findByKey('site_datasource');
      if (!existing) {
        const filePath = join(process.cwd(), 'public', 'cloud-datasource.json');
        const jsonContent = JSON.parse(await readFile(filePath, 'utf8'));
        await this.schoolSettingRepository.create({
          key: 'site_datasource',
          category: 'Content',
          description: 'Full home page and website section layout configuration datasource',
          value: jsonContent,
          status: 'Active',
        });
      }
    } catch (err) {
      console.warn('[SchoolSettingsService.seedSiteDatasource] Skipped:', err);
    }
  }

  async syncBrandingToDatasource(key: string, value: any) {
    // Deprecated: No separate records created. Everything is managed inside site_datasource.
    return;
  }

  async create(dto: CreateSchoolSettingDto) {
    try {
      await this.cacheManager.del('site_datasource');
    } catch {
      // ignore
    }
    const status = dto.status || 'Active';
    const existing = await this.schoolSettingRepository.findByKey(dto.key);
    if (existing) {
      return this.schoolSettingRepository.update(existing._id.toString(), { ...dto, status });
    }
    return this.schoolSettingRepository.create({ ...dto, status });
  }

  async findAll(queryDto: PaginationQueryDto = {}, category?: string, status?: string) {
    const additionalFilter: Record<string, any> = {
      key: { $ne: 'site_logo' },
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

  async findOne(id: string) {
    return this.schoolSettingRepository.findById(id);
  }

  async findByKey(key: string) {
    const cacheKey = `setting_key_${key}`;
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const res = await this.schoolSettingRepository.findByKey(key);
    if (res) {
      try {
        await this.cacheManager.set(cacheKey, res, 60 * 1000);
      } catch {
        // ignore
      }
    }
    return res;
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
    if (key && key !== 'site_datasource' && dto.value) {
      await this.syncBrandingToDatasource(key, dto.value);
    }

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
}
