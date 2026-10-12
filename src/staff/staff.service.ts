import { Injectable, Logger } from '@nestjs/common';
import { StaffRepository } from './staff.repository';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly staffRepository: StaffRepository,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(createStaffDto: CreateStaffDto) {
    return this.staffRepository.create(createStaffDto);
  }

  async findAll(
    queryDto: PaginationQueryDto = {},
    department?: string,
    status?: string,
  ) {
    const additionalFilter: Record<string, any> = {};
    if (department) additionalFilter.department = department;
    if (status) additionalFilter.status = status;

    return this.staffRepository.findAll(
      queryDto,
      ['name', 'employeeId', 'email', 'phone', 'department', 'designation'],
      additionalFilter,
    );
  }

  async findOne(id: string) {
    return this.staffRepository.findById(id);
  }

  async update(id: string, updateStaffDto: UpdateStaffDto) {
    return this.staffRepository.update(id, updateStaffDto);
  }

  async remove(id: string) {
    try {
      const staff = await this.staffRepository.findById(id);
      if (staff) {
        if (staff.avatar) await this.uploadsService.deleteFileByUrl(staff.avatar);
        if (staff.resume) await this.uploadsService.deleteFileByUrl(staff.resume);
        if (staff.document) {
          const docs = Array.isArray(staff.document) ? staff.document : [staff.document];
          for (const doc of docs) {
            if (doc) await this.uploadsService.deleteFileByUrl(doc);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not cleanup media files for staff ${id}: ${err}`);
    }
    return this.staffRepository.delete(id);
  }
}
