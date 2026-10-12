import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Staff, StaffSchema } from './schemas/staff.schema';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';

import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Staff.name, schema: StaffSchema }]),
    UploadsModule,
  ],
  controllers: [StaffController],
  providers: [StaffRepository, StaffService],
  exports: [StaffService, StaffRepository],
})
export class StaffModule {}
