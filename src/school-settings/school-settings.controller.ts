import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchoolSettingsService } from './school-settings.service';
import { UpdateSchoolSettingDto } from './dto/update-school-setting.dto';
import { UpdatePartialSettingDto } from './dto/update-partial-setting.dto';
import { UpdateSingleSectionDto } from './dto/update-single-section.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('School Settings')
@Controller('v1/school-settings')
export class SchoolSettingsController {
  constructor(private readonly schoolSettingsService: SchoolSettingsService) {}

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
  @ApiOperation({ summary: 'Get public website data datasource from database' })
  getDatasource() {
    return this.schoolSettingsService.getDatasource();
  }

  @Get('section/:sectionKey')
  @ApiOperation({ summary: 'Get a single section of the website datasource' })
  @ApiParam({
    name: 'sectionKey',
    description: 'Section key identifier (e.g. hero, header, footer, whatsapp, popupBanner, menuCard, sec1, sec3, sec6, certified_board, etc.)',
    example: 'header',
  })
  getSection(@Param('sectionKey') sectionKey: string) {
    return this.schoolSettingsService.getSection(sectionKey);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('partial')
  @ApiOperation({ summary: 'Partially update one or multiple sections of the website datasource' })
  @ApiBody({
    type: UpdatePartialSettingDto,
    description: 'Complete sample for updating one or multiple sections partially without touching other sections',
  })
  updatePartial(@Body() dto: UpdatePartialSettingDto) {
    return this.schoolSettingsService.updatePartial(dto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('section/:sectionKey')
  @ApiOperation({ summary: 'Partially update a single section of the website datasource' })
  @ApiParam({
    name: 'sectionKey',
    description: 'Section key identifier (e.g. hero, header, footer, whatsapp, popupBanner, menuCard, sec1, sec3, sec6, certified_board, etc.)',
    example: 'header',
  })
  @ApiBody({
    type: UpdateSingleSectionDto,
    description: 'Single section data payload (accepts { value: ... } or raw section object)',
  })
  updateSection(@Param('sectionKey') sectionKey: string, @Body() dto: UpdateSingleSectionDto) {
    const value = dto && typeof dto === 'object' && 'value' in dto ? dto.value : dto;
    return this.schoolSettingsService.updatePartial({ [sectionKey]: value });
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
