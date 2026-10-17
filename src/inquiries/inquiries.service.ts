import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InquiryRepository } from './inquiry.repository';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { InquiryStatus } from './schemas/inquiry.schema';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

  constructor(
    private readonly inquiryRepository: InquiryRepository,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => UploadsService))
    private readonly uploadsService: UploadsService,
  ) {}

  async create(createInquiryDto: CreateInquiryDto) {
    const createdInquiry: any = await this.inquiryRepository.create(createInquiryDto);

    const generatedId = createdInquiry.publicId || (createdInquiry._id ? createdInquiry._id.toString() : '');

    // Emit event for notification service
    this.eventEmitter.emit('inquiry.created', {
      inquiryId: generatedId,
      name: createdInquiry.name,
      email: createdInquiry.email,
      contact: createdInquiry.contact,
      inquiryType: createdInquiry.inquiryType,
      message: createdInquiry.message,
    });

    return createdInquiry;
  }

  async findAll(
    queryDto: PaginationQueryDto = {},
    inquiryType?: string,
    status?: string,
  ) {
    const additionalFilter: Record<string, any> = {};
    if (inquiryType) {
      additionalFilter.inquiryType = { $regex: new RegExp(inquiryType, 'i') };
    }
    if (status) {
      additionalFilter.status = status;
    }

    return this.inquiryRepository.findAll(
      queryDto,
      ['name', 'contact', 'email', 'inquiryType', 'message'],
      additionalFilter,
    );
  }

  async findOne(id: string) {
    return this.inquiryRepository.findById(id);
  }

  async trackInquiry(searchQuery: string) {
    if (!searchQuery || !searchQuery.trim()) {
      return { items: [], total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPrevPage: false };
    }
    const cleanQuery = searchQuery.trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanQuery);

    const additionalFilter: Record<string, any> = isObjectId
      ? { _id: cleanQuery }
      : {
          $or: [
            { email: { $regex: new RegExp(cleanQuery, 'i') } },
            { contact: { $regex: new RegExp(cleanQuery.replace(/[^0-9+]/g, ''), 'i') } },
            { name: { $regex: new RegExp(cleanQuery, 'i') } },
          ],
        };

    return this.inquiryRepository.findAll(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      [],
      additionalFilter,
    );
  }

  async update(id: string, updateInquiryDto: UpdateInquiryDto) {
    return this.inquiryRepository.update(id, updateInquiryDto);
  }

  async remove(id: string) {
    try {
      const inquiry: any = await this.inquiryRepository.findById(id);
      if (inquiry) {
        const urlsToDelete = new Set<string>();

        if (inquiry.profileImageUrl) urlsToDelete.add(inquiry.profileImageUrl);
        if (inquiry.marksheetUrl) urlsToDelete.add(inquiry.marksheetUrl);
        if (Array.isArray(inquiry.documents)) {
          inquiry.documents.forEach((d: string) => {
            if (d && typeof d === 'string') urlsToDelete.add(d);
          });
        }

        // Extract URLs embedded in message text
        if (inquiry.message && typeof inquiry.message === 'string') {
          const matchedUrls = inquiry.message.match(/https?:\/\/[^\s"'>\)]+/gi) || [];
          matchedUrls.forEach((url: string) => {
            if (url.includes('cloudinary') || url.includes('/uploads/')) {
              urlsToDelete.add(url);
            }
          });
        }

        for (const url of Array.from(urlsToDelete)) {
          try {
            await this.uploadsService.deleteFileByUrl(url);
          } catch (deleteErr) {
            this.logger.warn(`Failed to delete attached inquiry media ${url}: ${deleteErr}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not fetch inquiry ${id} for Cloudinary media cleanup: ${err}`);
    }

    return this.inquiryRepository.delete(id);
  }

  async seedDefaultInquiries() {
    const count = await this.inquiryRepository.count();
    if (count > 0) {
      return { message: 'Inquiries collection already seeded', seeded: false };
    }

    const defaultInquiries: CreateInquiryDto[] = [
      {
        name: 'Amit Kumar',
        contact: '+91 9876543210',
        email: 'amit.kumar@example.com',
        inquiryType: 'Admission',
        message: 'Looking for admission in Class 6 for academic year 2026-2027. Please share admission schedule.',
        status: InquiryStatus.PENDING,
      },
      {
        name: 'Sunita Roy',
        contact: '+91 9123456789',
        email: 'sunita.roy@example.com',
        inquiryType: 'Fee Structure',
        message: 'Could you please provide the fee structure details for Senior Secondary classes?',
        status: InquiryStatus.IN_PROGRESS,
      },
      {
        name: 'Rohan Sharma',
        contact: '+91 9988776655',
        email: 'rohan.sharma@example.com',
        inquiryType: 'Transport',
        message: 'Do you provide school bus transport facility to Sector 14 area?',
        status: InquiryStatus.RESOLVED,
      },
    ];

    const seeded = await Promise.all(
      defaultInquiries.map((dto) => this.inquiryRepository.create(dto)),
    );

    return { message: 'Successfully seeded default inquiries', count: seeded.length, items: seeded };
  }
}
