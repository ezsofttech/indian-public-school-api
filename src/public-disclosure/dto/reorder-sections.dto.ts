import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ReorderSectionItemDto {
  @ApiProperty({ description: 'Section ID (MongoDB _id or publicId)' })
  @IsNotEmpty()
  @IsString()
  id!: string;

  @ApiProperty({ description: 'New order index' })
  @IsNumber()
  order!: number;
}

export class ReorderSectionsDto {
  @ApiProperty({ type: [ReorderSectionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderSectionItemDto)
  sections!: ReorderSectionItemDto[];
}
