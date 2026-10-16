import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  DisclosureItem,
  DisclosureSection,
  DisclosureView,
} from '../interfaces/disclosure.interface';
import type { SequenceType } from '../utils/sequence-serializer.util';

export class DisclosureViewDto implements DisclosureView {
  @ApiPropertyOptional({ default: 'VIEW', description: 'Button or link label' })
  @IsOptional()
  @IsString()
  label?: string = 'VIEW';

  @ApiPropertyOptional({ enum: ['PDF', 'LINK'], default: 'PDF' })
  @IsOptional()
  @IsIn(['PDF', 'LINK'])
  type?: 'PDF' | 'LINK' = 'PDF';

  @ApiPropertyOptional({ description: 'File URL, document path, or external link' })
  @IsOptional()
  @IsString()
  url?: string | null;

  @ApiPropertyOptional({ default: true, description: 'Whether to open in new tab' })
  @IsOptional()
  @IsBoolean()
  openInNewTab?: boolean;
}

export class DisclosureItemDto implements DisclosureItem {
  @ApiPropertyOptional({
    description: 'Serial number or sequence code (e.g. 1, 2, 3... or A, B, C... or I, II, III...)',
    example: 1,
  })
  @IsOptional()
  srNo?: number | string;

  @ApiPropertyOptional({ description: 'Row title / description heading', example: 'NAME OF THE SCHOOL' })
  @IsOptional()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Optional text or multiline detail' })
  @IsOptional()
  @IsString()
  detail?: string | null;

  @ApiPropertyOptional({
    description: 'Optional document or link view configuration',
    type: () => DisclosureViewDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DisclosureViewDto)
  view?: DisclosureViewDto | null;
}

export class CreatePublicDisclosureSectionDto implements Partial<DisclosureSection> {
  @ApiPropertyOptional({
    description: 'Unique section key (auto-generated in background if omitted)',
    example: 'GENERAL_INFORMATION',
  })
  @IsOptional()
  @IsString()
  sectionKey?: string;

  @ApiProperty({ description: 'Section title heading', example: 'A. GENERAL INFORMATION' })
  @IsNotEmpty({ message: 'Section title is required' })
  @IsString()
  sectionTitle!: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ description: 'Publication status', default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: 'Ordered list of disclosure rows',
    type: () => [DisclosureItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisclosureItemDto)
  items?: DisclosureItemDto[];

  @ApiPropertyOptional({ description: 'Session ID for tracking and rolling back staged uploads' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description:
      'Sequence style to enforce across all items (NUMERIC, UPPER_ALPHA, LOWER_ALPHA, UPPER_ROMAN, LOWER_ROMAN)',
    enum: [
      'NUMERIC',
      'UPPER_ALPHA',
      'LOWER_ALPHA',
      'UPPER_ROMAN',
      'LOWER_ROMAN',
    ],
  })
  @IsOptional()
  @IsIn([
    'NUMERIC',
    'UPPER_ALPHA',
    'LOWER_ALPHA',
    'UPPER_ROMAN',
    'LOWER_ROMAN',
  ])
  sequenceStyle?: SequenceType;
}
