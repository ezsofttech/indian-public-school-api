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
    const count = await this.reviewRepository.count();
    if (count > 0) {
      // Mark initial unapproved records as approved if needed
      return { message: 'Reviews collection already populated', seeded: false };
    }

    const defaultReviews: CreateReviewDto[] = [
      {
        name: "Shriyansh Shekhar Lenka",
        batch: "2021-2022",
        rating: 5,
        feedback: "Satisfied with studies and overall performance of the child.",
        avatar: "https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Review/ShreyanshSekharJha.jpg",
        isApproved: true,
      },
      {
        name: "Abhishek Prakash Jha",
        batch: "2020-2022",
        rating: 5,
        feedback: "Good School, good environment for learning.",
        avatar: "https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Review/AbhishekPrakashJha.jpg",
        isApproved: true,
      },
      {
        name: "Ansh Singh",
        batch: "2021-2023",
        rating: 5,
        feedback: "Studies are good ..... satisfied with the academics and management of the school.",
        avatar: "https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Review/AnshSingh.jpg",
        isApproved: true,
      },
      {
        name: "Samay Palta Singh",
        batch: "2021-2022",
        rating: 4,
        feedback: "Good studies and good overall performance. Good improvement shown.",
        avatar: "https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Review/SmayPatlaSingh.jpg",
        isApproved: true,
      },
    ];

    const seeded = await Promise.all(
      defaultReviews.map((dto) => this.reviewRepository.create(dto)),
    );

    return { message: 'Successfully seeded reviews', count: seeded.length, items: seeded };
  }
}
