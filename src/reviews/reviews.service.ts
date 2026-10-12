import { Injectable } from '@nestjs/common';
import { ReviewRepository } from './review.repository';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewRepository: ReviewRepository) { }

  async create(createReviewDto: CreateReviewDto) {
    const payload = {
      ...createReviewDto,
      isApproved: createReviewDto.isApproved !== undefined ? createReviewDto.isApproved : true,
    };
    return this.reviewRepository.create(payload);
  }

  async findAll(
    queryDto: PaginationQueryDto = {},
    rating?: number,
    batch?: string,
    isApproved?: boolean,
  ) {
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

    return this.reviewRepository.findAll(
      queryDto,
      ['name', 'batch', 'feedback'],
      additionalFilter,
    );
  }

  async findOne(id: string) {
    return this.reviewRepository.findById(id);
  }

  async update(id: string, updateReviewDto: UpdateReviewDto) {
    return this.reviewRepository.update(id, updateReviewDto);
  }

  async remove(id: string) {
    return this.reviewRepository.delete(id);
  }

  async seedDefaultReviews() {
    return { message: 'No default reviews configured', count: 0, items: [] };
  }
}
