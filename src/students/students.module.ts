import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Student, StudentSchema } from './schemas/student.schema';
import { StudentRepository } from './student.repository';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Student.name, schema: StudentSchema }]),
    UploadsModule,
  ],
  controllers: [StudentsController],
  providers: [StudentRepository, StudentsService],
  exports: [StudentsService, StudentRepository],
})
export class StudentsModule {}
