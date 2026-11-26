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
} from '@nestjs/common';
import { SchoolSettingsService } from './school-settings.service';
import { CreateSchoolSettingDto } from './dto/create-school-setting.dto';
import { UpdateSchoolSettingDto } from './dto/update-school-setting.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('School Settings')
@Controller('v1/school-settings')
export class SchoolSettingsController {
  constructor(private readonly schoolSettingsService: SchoolSettingsService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new school setting configuration' })
  create(@Body() dto: CreateSchoolSettingDto) {
    return this.schoolSettingsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List school settings with pagination and optional category/status filter' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category name' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (Active / Inactive)' })
  findAll(
    @Query() queryDto: PaginationQueryDto = {},
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.schoolSettingsService.findAll(queryDto, category, status);
  }

  @Get('datasource')
  @ApiOperation({ summary: 'Get public website data datasource with JSON-file fallback' })
  getDatasource() {
    return this.schoolSettingsService.getDatasource();
  }

  @Get('regarding')
  @ApiOperation({ summary: 'Get the About/Regarding section for the public website' })
  getRegarding() {
    return this.schoolSettingsService.getRegarding();
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Get a specific setting value by key name' })
  findByKey(@Param('key') key: string) {
    return this.schoolSettingsService.findByKey(key);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get setting details by ID' })
  findOne(@Param('id') id: string) {
    return this.schoolSettingsService.findOne(id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a school setting configuration by ID' })
  update(@Param('id') id: string, @Body() dto: UpdateSchoolSettingDto) {
    return this.schoolSettingsService.update(id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a school setting by ID' })
  remove(@Param('id') id: string) {
    return this.schoolSettingsService.remove(id);
  }
}
