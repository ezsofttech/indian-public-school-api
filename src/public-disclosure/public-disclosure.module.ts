import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsModule } from '../uploads/uploads.module';
import { PublicDisclosureController } from './public-disclosure.controller';
import { PublicDisclosureService } from './public-disclosure.service';
import { PublicDisclosureRepository } from './public-disclosure.repository';
import {
  PublicDisclosureSection,
  PublicDisclosureSectionSchema,
} from './schemas/public-disclosure-section.schema';
import {
  PublicDisclosureConfig,
  PublicDisclosureConfigSchema,
} from './schemas/public-disclosure-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PublicDisclosureSection.name,
        schema: PublicDisclosureSectionSchema,
      },
      {
        name: PublicDisclosureConfig.name,
        schema: PublicDisclosureConfigSchema,
      },
    ]),
    UploadsModule,
  ],
  controllers: [PublicDisclosureController],
  providers: [PublicDisclosureService, PublicDisclosureRepository],
  exports: [PublicDisclosureService, PublicDisclosureRepository],
})
export class PublicDisclosureModule {}
