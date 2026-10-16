import { PartialType } from '@nestjs/swagger';
import { CreatePublicDisclosureSectionDto } from './create-section.dto';

export class UpdatePublicDisclosureSectionDto extends PartialType(
  CreatePublicDisclosureSectionDto,
) {}
