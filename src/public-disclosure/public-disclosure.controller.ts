import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PublicDisclosureService } from './public-disclosure.service';
import {
  CreatePublicDisclosureSectionDto,
  UpdatePublicDisclosureSectionDto,
  ReorderSectionsDto,
  CancelStagedUploadDto,
  SyncSequenceStyleDto,
  UpdatePublicDisclosureConfigDto,
} from './dto';

@ApiTags('Public Disclosure')
@Controller('v1/public-disclosure')
export class PublicDisclosureController {
  constructor(private readonly service: PublicDisclosureService) {}

  @Get('sections')
  @ApiOperation({ summary: 'List all public disclosure sections and rows' })
  @ApiQuery({
    name: 'publishedOnly',
    required: false,
    type: Boolean,
    description: 'Filter only published sections',
  })
  findAll(@Query('publishedOnly') publishedOnly?: string) {
    const isPublishedOnly = publishedOnly === 'true' || publishedOnly === '1';
    return this.service.findAll(isPublishedOnly);
  }

  @Get('sections/:id')
  @ApiOperation({
    summary: 'Get a single public disclosure section by ID or key',
  })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('sections')
  @ApiOperation({ summary: 'Create a new public disclosure section' })
  @ApiBody({ type: CreatePublicDisclosureSectionDto })
  create(@Body() dto: CreatePublicDisclosureSectionDto, @Req() req: any) {
    return this.service.createSection(dto, req.user);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('sections/:id')
  @ApiOperation({
    summary: 'Update an existing public disclosure section by ID (efficient delta update)',
  })
  @ApiBody({ type: UpdatePublicDisclosureSectionDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePublicDisclosureSectionDto,
    @Req() req: any,
  ) {
    return this.service.updateSection(id, dto, req.user);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('sections/:id')
  @ApiOperation({ summary: 'Delete a public disclosure section by ID' })
  remove(@Param('id') id: string) {
    return this.service.removeSection(id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Put('reorder')
  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder disclosure sections' })
  @ApiBody({ type: ReorderSectionsDto })
  reorder(@Body() dto: ReorderSectionsDto) {
    return this.service.reorderSections(dto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('sync-sequence-style')
  @Put('sync-sequence-style')
  @ApiOperation({
    summary:
      'Synchronize serialization style (1,2,3... / A,B,C... / I,II,III...) across all sections',
  })
  @ApiBody({ type: SyncSequenceStyleDto })
  syncSequenceStyle(@Body() dto: SyncSequenceStyleDto) {
    return this.service.syncAllSectionsSequenceStyle(dto.sequenceStyle);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @ApiOperation({
    summary:
      'Upload a disclosure document (PDF) through existing upload pipeline',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string', nullable: true },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId?: string,
    @Req() req?: any,
  ) {
    return this.service.uploadDocument(file, sessionId, req?.user);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('staged-file')
  @ApiOperation({ summary: 'Cancel/discard an uncommitted staged upload' })
  @ApiBody({ type: CancelStagedUploadDto })
  cancelStaged(@Body() dto: CancelStagedUploadDto, @Req() req: any) {
    return this.service.cancelStagedUpload(dto.url, dto.sessionId, req.user);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('cleanup-abandoned')
  @ApiOperation({
    summary: 'Clean up abandoned staged uploads older than threshold',
  })
  @ApiQuery({ name: 'maxAgeHours', required: false, type: Number })
  cleanupAbandoned(@Query('maxAgeHours') maxAgeHours?: string) {
    const hours = maxAgeHours ? Number(maxAgeHours) : 2;
    return this.service.cleanupAbandonedUploads(hours);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('seed-defaults')
  @ApiOperation({
    summary: 'Seed standard CBSE Mandatory Public Disclosure sections if empty',
  })
  seedDefaults() {
    return this.service.seedDefaultSections();
  }

  @Get('config')
  @ApiOperation({
    summary:
      'Get public disclosure statutory configuration (Affiliation No, School Code, Notice)',
  })
  getConfig() {
    return this.service.getConfig();
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('config')
  @Put('config')
  @ApiOperation({
    summary:
      'Update public disclosure statutory configuration (Affiliation No, School Code, Notice)',
  })
  @ApiBody({ type: UpdatePublicDisclosureConfigDto })
  updateConfig(
    @Body() dto: UpdatePublicDisclosureConfigDto,
    @Req() req: any,
  ) {
    return this.service.updateConfig(dto, req.user);
  }
}
