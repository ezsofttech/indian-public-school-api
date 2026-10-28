import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Gallery')
@Controller('v1/gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new gallery entry' })
  create(@Body() createGalleryDto: CreateGalleryDto) {
    return this.galleryService.create(createGalleryDto);
  }

  @Get()
  @ApiOperation({ summary: 'List gallery items with pagination, eventType, and directory filter' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Filter gallery by event type' })
  @ApiQuery({ name: 'directory', required: false, description: 'Filter gallery by directory path' })
  findAll(
    @Query() queryDto: PaginationQueryDto = {},
    @Query('eventType') eventType?: string,
    @Query('directory') directory?: string,
  ) {
    return this.galleryService.findAll(queryDto, eventType, directory);
  }

  @Get('*')
  @ApiOperation({ summary: 'Get gallery item details by ID' })
  findOne(@Param() params: any, @Req() req: any) {
    const rawPath = req.url ? req.url.split('?')[0] : '';
    const targetId = decodeURIComponent(rawPath.replace(/^\/api\/v1\/gallery\/?/, '').replace(/^\/v1\/gallery\/?/, '').replace(/^\/+/, ''));
    return this.galleryService.findOne(targetId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('*')
  @ApiOperation({ summary: 'Update a gallery entry by ID' })
  update(
    @Body() updateGalleryDto: UpdateGalleryDto,
    @Param() params: any,
    @Req() req: any,
  ) {
    const rawPath = req.url ? req.url.split('?')[0] : '';
    const targetId = decodeURIComponent(rawPath.replace(/^\/api\/v1\/gallery\/?/, '').replace(/^\/v1\/gallery\/?/, '').replace(/^\/+/, ''));
    return this.galleryService.update(targetId, updateGalleryDto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('*')
  @ApiOperation({ summary: 'Delete a gallery item by ID' })
  remove(@Param() params: any, @Req() req: any) {
    const rawPath = req.url ? req.url.split('?')[0] : '';
    const targetId = decodeURIComponent(rawPath.replace(/^\/api\/v1\/gallery\/?/, '').replace(/^\/v1\/gallery\/?/, '').replace(/^\/+/, ''));
    return this.galleryService.remove(targetId);
  }
}
