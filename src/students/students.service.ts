import { Injectable, Logger } from '@nestjs/common';
import { StudentRepository } from './student.repository';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(createStudentDto: CreateStudentDto) {
    return this.studentRepository.create(createStudentDto);
  }

  async findAll(queryDto: PaginationQueryDto = {}, grade?: string, status?: string) {
    const additionalFilter: Record<string, any> = {};
    if (grade) additionalFilter.grade = grade;
    if (status) additionalFilter.status = status;

    return this.studentRepository.findAll(
      queryDto,
      [
        'name',
        'studentId',
        'parentName',
        'parentEmail',
        'parentPhone',
        'grade',
        'section',
      ],
      additionalFilter,
    );
  }

  async findOne(id: string) {
    return this.studentRepository.findById(id);
  }

  async update(id: string, updateStudentDto: UpdateStudentDto) {
    return this.studentRepository.update(id, updateStudentDto);
  }

  async remove(id: string) {
    try {
      const student = await this.studentRepository.findById(id);
      if (student) {
        if (student.avatar) await this.uploadsService.deleteFileByUrl(student.avatar);
        if (student.document) {
          const docs = Array.isArray(student.document) ? student.document : [student.document];
          for (const doc of docs) {
            if (doc) await this.uploadsService.deleteFileByUrl(doc);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not cleanup media files for student ${id}: ${err}`);
    }
    return this.studentRepository.delete(id);
  }
}
