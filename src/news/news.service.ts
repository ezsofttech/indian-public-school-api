import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsRepository } from './news.repository';

@Injectable()
export class NewsService {
  private cacheKeys = new Set<string>();

  constructor(
    private readonly newsRepository: NewsRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async invalidateNewsCache() {
    try {
      for (const key of this.cacheKeys) {
        await this.cacheManager.del(key);
      }
      this.cacheKeys.clear();
    } catch {
      // ignore
    }
  }

  async create(createNewsDto: CreateNewsDto) {
    const payload = { ...createNewsDto };
    if (!payload.redirectUrl && payload.attachmentUrl) {
      payload.redirectUrl = payload.attachmentUrl;
    }
    const created = await this.newsRepository.create(payload);
    await this.invalidateNewsCache();
    return created;
  }

  async findAll(queryDto: PaginationQueryDto = {}) {
    const cacheKey = `news_list_${JSON.stringify(queryDto)}`;
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const res = await this.newsRepository.findAll(queryDto, ['title', 'redirectUrl', 'attachmentUrl']);
    try {
      this.cacheKeys.add(cacheKey);
      await this.cacheManager.set(cacheKey, res, 60 * 1000);
    } catch {
      // ignore
    }
    return res;
  }

  async findOne(id: string) {
    return this.newsRepository.findById(id);
  }

  async update(id: string, updateNewsDto: UpdateNewsDto) {
    const payload = { ...updateNewsDto };
    if (!payload.redirectUrl && payload.attachmentUrl) {
      payload.redirectUrl = payload.attachmentUrl;
    }
    const updated = await this.newsRepository.update(id, payload);
    await this.invalidateNewsCache();
    return updated;
  }

  async remove(id: string) {
    const res = await this.newsRepository.delete(id);
    await this.invalidateNewsCache();
    return res;
  }
}
