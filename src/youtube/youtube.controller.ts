import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { YouTubeService } from './youtube.service';
import { YouTubeQueryDto } from './dto/youtube-query.dto';

@ApiTags('YouTube')
@Controller(['v1/youtube', 'youtube'])
export class YouTubeController {
  constructor(private readonly youtubeService: YouTubeService) {}

  @Get('videos')
  @ApiOperation({
    summary: 'Get YouTube channel videos with category filtering, search, and pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'category', required: false, type: String, example: 'Events & Celebrations' })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'Navratri' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['newest', 'oldest', 'popular', 'title'],
    example: 'newest',
  })
  async getVideos(@Query() query: YouTubeQueryDto) {
    return this.youtubeService.getVideos(query);
  }

  @Get('channel')
  @ApiOperation({ summary: 'Get official YouTube channel metadata & statistics' })
  async getChannel() {
    return this.youtubeService.getChannelInfo();
  }

  @Get('playlists')
  @ApiOperation({ summary: 'Get official YouTube channel playlists' })
  async getPlaylists() {
    return this.youtubeService.getPlaylists();
  }

  @Get('videos/:id')
  @ApiOperation({ summary: 'Get single YouTube video details by ID' })
  @ApiParam({ name: 'id', required: true, description: 'YouTube video ID' })
  async getVideoById(@Param('id') id: string) {
    const video = await this.youtubeService.getVideoById(id);
    if (!video) {
      throw new NotFoundException(`YouTube video with ID '${id}' not found`);
    }
    return video;
  }
}
