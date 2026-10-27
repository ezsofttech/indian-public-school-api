import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';

export class YouTubeQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, default: 50, description: 'Items limit per page (1-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'Events & Celebrations', description: 'Filter by video category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Navratri', description: 'Search term in title and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'newest',
    default: 'newest',
    enum: ['newest', 'oldest', 'popular', 'title'],
    description: 'Sorting criteria',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'popular', 'title'])
  sortBy?: 'newest' | 'oldest' | 'popular' | 'title' = 'newest';

  @ApiPropertyOptional({ description: 'YouTube API nextPageToken for cursor pagination' })
  @IsOptional()
  @IsString()
  pageToken?: string;
}
