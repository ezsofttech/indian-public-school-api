import { Injectable } from '@nestjs/common';
import { ReviewRepository } from './review.repository';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewRepository: ReviewRepository) {}

  async create(createReviewDto: CreateReviewDto) {
    return this.reviewRepository.create(createReviewDto);
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
      additionalFilter.isApproved = String(isApproved) === 'true';
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
      return { message: 'Reviews collection already seeded', seeded: false };
    }

    const defaultReviews: CreateReviewDto[] = [
      {
        name: 'Pradip',
        batch: '2020-2022',
        rating: 3,
        feedback:
          'Great school. All the teachers we had cares about both academic and personal growth. We have 3 kids so we didn’t just get lucky. It’s a small enough school so kids don’t get lost but big enough to have all the extra curricular activities to keep kids busy and be social. Love, love, love this school.',
        avatar: '/Review/Anonymous.png',
        isApproved: true,
      },
      {
        name: 'Abhishek Prakash Jha',
        batch: '2020-2022',
        rating: 5,
        feedback: 'good School, good environment.',
        avatar: '/Review/AbhishekPrakashJha.jpg',
        isApproved: true,
      },
      {
        name: 'Shriyansh Shekhar Lenka',
        batch: '2021-2022',
        rating: 5,
        feedback: 'Satisfied with studies and overall performance of the child.',
        avatar: '/Review/ShreyanshSekharJha.jpg',
        isApproved: true,
      },
      {
        name: 'Samay Palta Singh',
        batch: '2021-2022',
        rating: 3,
        feedback: 'Good studies and good overall performance .Good improvement shown .',
        avatar: '/Review/SmayPatlaSingh.jpg',
        isApproved: true,
      },
    ];

    const seeded = await Promise.all(
      defaultReviews.map((dto) => this.reviewRepository.create(dto)),
    );

    return { message: 'Successfully seeded reviews', count: seeded.length, items: seeded };
  }
}
