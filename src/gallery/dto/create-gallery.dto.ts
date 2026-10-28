import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { GalleryAlbum, GalleryEventType } from '../schemas/gallery.schema';

export class CreateGalleryDto {
  @ApiProperty({
    example: 'Annual Sports Day 2026',
    description: 'Name of the school event',
  })
  @IsString()
  @IsNotEmpty()
  eventName: string;

  @ApiPropertyOptional({
    example: 'Events',
    enum: GalleryAlbum,
    default: GalleryAlbum.EVENTS,
    description: 'Album category name for photo grouping (e.g. Events, Campus, Sports)',
  })
  @IsOptional()
  @IsString()
  album?: string;

  @ApiPropertyOptional({
    example: 'Sports',
    enum: GalleryEventType,
    default: GalleryEventType.GENERAL,
    description: 'Category or type of event (e.g. Sports, Cultural, Academic)',
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({
    example: 'Album/Events',
    default: 'Album/Events',
    description: 'Directory folder path to organize set of images (e.g. Album/Events, Album/Sports)',
  })
  @IsOptional()
  @IsString()
  directory?: string;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/demo/image/upload/v12345/sports-day.jpg'],
    description: 'Cloudinary or storage URLs for the gallery image or video assets',
    type: [String],
  })
  @Transform(({ value }) => {
    if (!value) return [];
    if (typeof value === 'string') return value.trim() ? [value] : [];
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim());
    return [];
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fileUrl?: string[];

  @ApiPropertyOptional({
    example: 'image/jpeg',
    description: 'MIME content type of the asset file (e.g. image/jpeg, application/pdf, video/mp4)',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

