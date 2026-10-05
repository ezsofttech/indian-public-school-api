import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'Pradip', description: 'Reviewer name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '2020-2022', description: 'Passing or studying batch years' })
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiProperty({ example: 5, description: 'Star rating score (1 to 5)', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    example: 'Great school. All the teachers we had cares about both academic and personal growth.',
    description: 'Detailed review feedback comment',
  })
  @IsString()
  @IsNotEmpty()
  feedback: string;

  @ApiPropertyOptional({
    example: '/Review/Anonymous.png',
    description: 'Avatar image path or URL',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Approval status flag for display on website',
  })
  @IsOptional()
  @IsBoolean()
  isApproved?: boolean;
}
