import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MenuItemsService } from './menu-items.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@ApiTags('Menu Items')
@Controller('v1/menu-items')
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new menu item' })
  create(@Body() createDto: CreateMenuItemDto) {
    return this.menuItemsService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get menu items (hierarchical tree or flat list)' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by category (e.g. Header, Footer)' })
  @ApiQuery({ name: 'publishedOnly', required: false, type: String, description: 'Filter published items' })
  @ApiQuery({ name: 'isPublished', required: false, type: String, description: 'Filter by published status' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search query string' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'flat', required: false, type: String, description: 'Return flat list if true' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Field to sort by' })
  @ApiQuery({ name: 'sortOrder', required: false, type: String, description: 'Sort direction (asc/desc)' })
  async findAll(
    @Query('category') category?: string,
    @Query('publishedOnly') publishedOnly?: string,
    @Query('isPublished') isPublished?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('flat') flat?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.menuItemsService.findAll({
      category,
      publishedOnly: publishedOnly || isPublished || status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      flat,
      sortBy,
      sortOrder,
    });
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default navigation menu items with 3-level parent-child relationship' })
  async seed() {
    return this.menuItemsService.seedDefaultMenuItems();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single menu item by ID or menuId' })
  async findOne(@Param('id') id: string) {
    return this.menuItemsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a menu item by ID or menuId' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateMenuItemDto) {
    return this.menuItemsService.update(id, updateDto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a menu item by query menuId' })
  @ApiQuery({ name: 'menuId', required: false, type: String, description: 'Menu item ID to remove' })
  async removeByQuery(@Query('menuId') menuId?: string) {
    const target = menuId || '';
    return this.menuItemsService.remove(target);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a menu item by path ID or menuId' })
  async remove(@Param('id') id: string) {
    return this.menuItemsService.remove(id);
  }
}
