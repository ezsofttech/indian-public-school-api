import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CareerPostRepository } from '../repositories/career-post.repository';
import { CreateCareerPostDto } from '../dto/create-career-post.dto';
import { UpdateCareerPostDto } from '../dto/update-career-post.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UploadsService } from '../../uploads/uploads.service';

@Injectable()
export class CareerPostsService {
  private readonly logger = new Logger(CareerPostsService.name);

  constructor(
    private readonly careerPostRepository: CareerPostRepository,
    private readonly uploadsService: UploadsService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async create(createCareerPostDto: CreateCareerPostDto) {
    return this.careerPostRepository.create(createCareerPostDto);
  }

  async findAll(queryDto: PaginationQueryDto = {}, isActive?: boolean) {
    const filter: Record<string, any> = {};
    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }
    return this.careerPostRepository.findAll(queryDto, ['title', 'qualification', 'description'], filter);
  }

  async findActiveOpenings() {
    return this.careerPostRepository.findActiveOpenings();
  }

  async findOne(id: string) {
    return this.careerPostRepository.findById(id);
  }

  async update(id: string, updateCareerPostDto: UpdateCareerPostDto) {
    return this.careerPostRepository.update(id, updateCareerPostDto);
  }

  async remove(id: string) {
    // Note: Career post images can be shared media assets chosen from the Cloudinary gallery
    // or static icons used across multiple openings and site pages.
    // We strictly do NOT delete the underlying image file from Cloudinary on post deletion
    // to prevent breaking other posts or pages reusing the same image.
    return this.careerPostRepository.delete(id);
  }
}
