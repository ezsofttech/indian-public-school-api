import { Injectable, Inject } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

export type Datasource = Record<string, unknown>;

const DATASOURCE_CACHE_KEY = 'site_datasource';

/**
 * Serves the public website content without making the website dependent on a
 * seeded MongoDB record. The JSON file is the reliable fallback used during
 * first deployment and whenever the setting has not been created yet.
 */
@Injectable()
export class RegardingService {
  constructor(
    private readonly schoolSettingsService: SchoolSettingsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async clearCache() {
    try {
      await this.cacheManager.del(DATASOURCE_CACHE_KEY);
    } catch {
      // ignore
    }
  }

  async getDatasource(): Promise<Datasource> {
    try {
      const nestCached = await this.cacheManager.get<Datasource>(DATASOURCE_CACHE_KEY);
      if (nestCached && Object.keys(nestCached).length > 0) {
        return nestCached;
      }
    } catch {
      // continue to fetch from database if cache lookup fails
    }

    let datasource: Datasource = {};
    try {
      const setting: any = await this.schoolSettingsService.findActiveSetting();
      const value = setting?.value;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        datasource = { ...(value as Datasource) };
      }
    } catch {
      // The JSON fallback must also work when MongoDB is temporarily down.
    }

    if (!datasource || Object.keys(datasource).length === 0) {
      try {
        const filePath = join(process.cwd(), 'public', 'cloud-datasource.json');
        datasource = JSON.parse(await readFile(filePath, 'utf8')) as Datasource;
      } catch {
        datasource = {};
      }
    }

    if (datasource && Object.keys(datasource).length > 0) {
      try {
        await this.cacheManager.set(DATASOURCE_CACHE_KEY, datasource, 60 * 1000);
      } catch {
        // ignore
      }
    }

    return datasource;
  }

  async getRegarding() {
    const datasource = await this.getDatasource();
    return datasource.aboutUs ?? [];
  }
}
