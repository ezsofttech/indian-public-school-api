import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';
import type { SequenceType } from '../utils/sequence-serializer.util';

export class SyncSequenceStyleDto {
  @ApiProperty({
    description:
      'Sequence style to apply to all disclosure sections and sub-row items',
    enum: [
      'NUMERIC',
      'UPPER_ALPHA',
      'LOWER_ALPHA',
      'UPPER_ROMAN',
      'LOWER_ROMAN',
    ],
    example: 'NUMERIC',
  })
  @IsNotEmpty({ message: 'sequenceStyle is required' })
  @IsIn([
    'NUMERIC',
    'UPPER_ALPHA',
    'LOWER_ALPHA',
    'UPPER_ROMAN',
    'LOWER_ROMAN',
  ])
  sequenceStyle!: SequenceType;
}
