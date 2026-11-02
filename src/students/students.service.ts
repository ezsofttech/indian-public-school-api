import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
    @Optional() private readonly eventEmitter?: EventEmitter2,
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
    const urlsToDelete: string[] = [];
    try {
      const student = await this.studentRepository.findById(id);
      if (student) {
        if (student.avatar) urlsToDelete.push(student.avatar);
        if (student.document) {
          const docs = Array.isArray(student.document) ? student.document : [student.document];
          for (const doc of docs) {
            if (doc) urlsToDelete.push(doc);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not find student ${id} before deletion: ${err}`);
    }

    if (urlsToDelete.length > 0) {
      if (this.eventEmitter) {
        this.eventEmitter.emit('media.cleanup', {
          urls: urlsToDelete,
          recordType: 'student',
          recordId: id,
        });
      }

      await Promise.allSettled(
        urlsToDelete.map((url) => this.uploadsService.deleteFileByUrl(url)),
      );
    }

    return this.studentRepository.delete(id);
  }
}
