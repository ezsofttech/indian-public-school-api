import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ReviewRepository } from './review.repository';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class ReviewsService {
  private cacheKeys = new Set<string>();

  constructor(
    private readonly reviewRepository: ReviewRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) { }

  private async invalidateReviewsCache() {
    try {
      for (const key of this.cacheKeys) {
        await this.cacheManager.del(key);
      }
      this.cacheKeys.clear();
    } catch {
      // ignore
    }
  }

  async create(createReviewDto: CreateReviewDto) {
    const payload = {
      ...createReviewDto,
      name: createReviewDto.name.trim(),
      isApproved: createReviewDto.isApproved !== undefined ? createReviewDto.isApproved : true,
    };
    const created = await this.reviewRepository.create(payload);
    await this.invalidateReviewsCache();
    return created;
  }

  async findAll(
    queryDto: PaginationQueryDto = {},
    rating?: number,
    batch?: string,
    isApproved?: boolean,
  ) {
    const cacheKey = `reviews_${JSON.stringify(queryDto)}_${rating}_${batch}_${isApproved}`;
    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const additionalFilter: Record<string, any> = {};
    if (rating !== undefined && rating !== null) {
      additionalFilter.rating = Number(rating);
    }
    if (batch) {
      additionalFilter.batch = batch;
    }
    if (isApproved !== undefined && isApproved !== null) {
      const isApp = String(isApproved) === 'true';
      additionalFilter.isApproved = isApp ? { $ne: false } : false;
    }

    const res = await this.reviewRepository.findAll(
      queryDto,
      ['name', 'batch', 'feedback'],
      additionalFilter,
    );

    try {
      this.cacheKeys.add(cacheKey);
      await this.cacheManager.set(cacheKey, res, 60 * 1000);
    } catch {
      // ignore
    }

    return res;
  }

  async findOne(id: string) {
    return this.reviewRepository.findById(id);
  }

  async update(id: string, updateReviewDto: UpdateReviewDto) {
    const updated = await this.reviewRepository.update(id, updateReviewDto);
    await this.invalidateReviewsCache();
    return updated;
  }

  async remove(id: string) {
    const res = await this.reviewRepository.delete(id);
    await this.invalidateReviewsCache();
    return res;
  }

  async seedDefaultReviews() {
    return { message: 'No default reviews configured', count: 0, items: [] };
  }
}
