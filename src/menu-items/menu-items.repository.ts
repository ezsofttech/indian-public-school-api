import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MenuItem, MenuItemDocument } from './schemas/menu-item.schema';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { generatePublicId } from '../common/utils/public-id';

@Injectable()
export class MenuItemsRepository {
  constructor(
    @InjectModel(MenuItem.name) private menuItemModel: Model<MenuItemDocument>,
  ) {}

  private generateSlug(title?: string, fallback = ''): string {
    if (!title) return fallback;
    const slugified = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slugified || fallback;
  }

  private async resolveParentAndLevel(
    parentIdInput?: string | null,
    currentItemId?: string,
  ): Promise<{ parentId: Types.ObjectId | null; level: number }> {
    if (!parentIdInput || !String(parentIdInput).trim()) {
      return { parentId: null, level: 1 };
    }

    const parentIdStr = String(parentIdInput).trim();
    if (currentItemId && parentIdStr === currentItemId) {
      throw new BadRequestException('A menu item cannot be its own parent.');
    }

    const isMongoId = Types.ObjectId.isValid(parentIdStr);
    const parent = await this.menuItemModel
      .findOne({
        $or: [
          ...(isMongoId ? [{ _id: new Types.ObjectId(parentIdStr) }] : []),
          { publicId: parentIdStr },
          { menuId: parentIdStr },
          { slug: parentIdStr },
        ],
      })
      .exec();

    if (!parent) {
      throw new BadRequestException(
        `Specified parent menu item "${parentIdStr}" does not exist.`,
      );
    }

    if (currentItemId && (String(parent._id) === currentItemId || parent.menuId === currentItemId)) {
      throw new BadRequestException('A menu item cannot be its own parent.');
    }

    const parentLevel = parent.level || 1;
    if (parentLevel === 1) {
      return { parentId: parent._id as Types.ObjectId, level: 2 };
    } else if (parentLevel === 2) {
      return { parentId: parent._id as Types.ObjectId, level: 3 };
    } else {
      throw new BadRequestException(
        `Cannot attach sub-item under "${parent.title}" (Level 3 menu item). Maximum navigation hierarchy depth is 3 levels.`,
      );
    }
  }

  private async checkDuplicateTitle(
    title: string,
    parentId: Types.ObjectId | null,
    category = 'Header',
    excludeId?: any,
  ): Promise<void> {
    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle) return;

    const filter: any = {
      title: { $regex: new RegExp(`^${trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      parentId: parentId || null,
      category: { $regex: new RegExp(`^${category.trim()}$`, 'i') },
    };

    if (excludeId) {
      const isMongoId = Types.ObjectId.isValid(String(excludeId));
      if (isMongoId) {
        filter._id = { $ne: new Types.ObjectId(String(excludeId)) };
      }
    }

    const existing = await this.menuItemModel.findOne(filter).exec();
    if (existing) {
      throw new BadRequestException(
        `A menu item with the title "${trimmedTitle}" already exists under this section. Duplicate titles are not allowed.`,
      );
    }
  }

  async removeDuplicates(): Promise<{ removed: number }> {
    const items = await this.menuItemModel.find().exec();
    const seenMap = new Map<string, any>();
    const toDeleteIds: any[] = [];

    for (const item of items) {
      const parentKey = item.parentId ? String(item.parentId) : 'root';
      const categoryKey = String(item.category || 'Header').toLowerCase();
      const titleKey = String(item.title || '').trim().toLowerCase();
      const compositeKey = `${categoryKey}:${parentKey}:${titleKey}`;

      if (seenMap.has(compositeKey)) {
        toDeleteIds.push(item._id);
      } else {
        seenMap.set(compositeKey, item._id);
      }
    }

    if (toDeleteIds.length > 0) {
      await this.menuItemModel.deleteMany({ _id: { $in: toDeleteIds } } as any).exec();
    }

    return { removed: toDeleteIds.length };
  }

  async create(createDto: CreateMenuItemDto): Promise<MenuItem> {
    const slug =
      (createDto.slug && createDto.slug.trim()) ||
      this.generateSlug(createDto.title) ||
      `menu-${Date.now()}`;
    const menuId = (createDto.menuId && createDto.menuId.trim()) || slug;

    const { parentId, level } = await this.resolveParentAndLevel(
      createDto.parentId,
    );

    await this.checkDuplicateTitle(
      createDto.title,
      parentId,
      createDto.category || 'Header',
    );

    const publicId =
      (createDto as any).publicId && String((createDto as any).publicId).trim()
        ? String((createDto as any).publicId).trim()
        : generatePublicId('MENU');

    const payload = {
      ...createDto,
      slug,
      menuId,
      publicId,
      parentId,
      level,
    };

    const created = new this.menuItemModel(payload);
    return created.save();
  }

  async upsertOne(dto: CreateMenuItemDto): Promise<any> {
    const slug =
      (dto.slug && dto.slug.trim()) ||
      this.generateSlug(dto.title) ||
      `menu-${Date.now()}`;
    const menuId = (dto.menuId && dto.menuId.trim()) || slug;

    const { parentId, level } = await this.resolveParentAndLevel(dto.parentId);

    const publicId =
      (dto as any).publicId && String((dto as any).publicId).trim()
        ? String((dto as any).publicId).trim()
        : generatePublicId('MENU');

    const payload = {
      ...dto,
      slug,
      menuId,
      publicId,
      parentId,
      level,
    };

    const titleRegex = new RegExp(`^${dto.title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const updated = await this.menuItemModel
      .findOneAndUpdate(
        {
          $or: [
            { menuId },
            { slug },
            { title: titleRegex, parentId: parentId || null },
          ],
        } as any,
        { $set: payload },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();

    return updated!;
  }

  async findAll(
    optionsOrCategory?:
      | {
          category?: string;
          publishedOnly?: boolean | string;
          search?: string;
          page?: number;
          limit?: number;
          flat?: boolean | string;
          sortBy?: string;
          sortOrder?: string;
        }
      | string,
    publishedOnlyParam?: boolean | string,
  ): Promise<any> {
    await this.removeDuplicates();

    const opts =
      typeof optionsOrCategory === 'object' && optionsOrCategory !== null
        ? optionsOrCategory
        : { category: optionsOrCategory, publishedOnly: publishedOnlyParam };

    const filter: any = {};

    const optsAny = opts as any;
    const pubVal = opts.publishedOnly || optsAny.isPublished || optsAny.status;
    if (pubVal !== undefined && pubVal !== null && pubVal !== '' && pubVal !== 'All') {
      const isPub = String(pubVal).toLowerCase();
      if (isPub === 'true' || isPub === 'active' || isPub === 'published' || isPub === '1') {
        filter.isPublished = true;
      } else if (isPub === 'false' || isPub === 'inactive' || isPub === 'draft' || isPub === '0') {
        filter.isPublished = false;
      }
    }

    if (opts.category && opts.category.trim()) {
      filter.category = { $regex: new RegExp(`^${opts.category.trim()}$`, 'i') };
    }

    if (opts.search && opts.search.trim()) {
      const regex = new RegExp(opts.search.trim(), 'i');
      filter.$or = [
        { title: regex },
        { slug: regex },
        { menuId: regex },
        { targetUrl: regex },
      ];
    }

    let sortOptions: any = { level: 1, order: 1, createdAt: 1 };
    if (opts.sortBy) {
      const sortDirection =
        String(opts.sortOrder).toLowerCase() === 'desc' || String(opts.sortOrder) === '-1'
          ? -1
          : 1;
      sortOptions = { [opts.sortBy]: sortDirection };
    }

    const items = await this.menuItemModel
      .find(filter)
      .sort(sortOptions)
      .lean()
      .exec();

    // Build lookup map for parent resolution by ObjectId, publicId, menuId, or slug
    const idMap = new Map<string, any>();
    items.forEach((item: any) => {
      const idStr = String(item._id);
      idMap.set(idStr, item);
      if (item.publicId) idMap.set(String(item.publicId), item);
      if (item.menuId) idMap.set(String(item.menuId), item);
      if (item.slug) idMap.set(String(item.slug), item);
    });

    const enrichedItems = items.map((item: any) => {
      let parentObj: any = null;
      if (item.parentId) {
        const parentKey = String(item.parentId);
        parentObj = idMap.get(parentKey) || null;
      }
      const publicId = item.publicId || item.menuId || String(item._id);
      return {
        ...item,
        id: publicId,
        publicId,
        parentTitle: parentObj ? parentObj.title : null,
        parent: parentObj
          ? {
              _id: String(parentObj._id),
              id: parentObj.publicId || parentObj.menuId || String(parentObj._id),
              publicId: parentObj.publicId || parentObj.menuId,
              title: parentObj.title,
              menuId: parentObj.menuId,
            }
          : null,
      };
    });

    const isFlat = opts.flat === true || String(opts.flat).toLowerCase() === 'true';

    // Check if pagination was requested (page or limit provided)
    const isPaginationRequested =
      (opts.page !== undefined && opts.page !== null) ||
      (opts.limit !== undefined && opts.limit !== null);

    const limitVal =
      opts.limit !== undefined && opts.limit !== null
        ? Number(opts.limit)
        : undefined;

    const isUnlimited =
      limitVal !== undefined && (limitVal <= 0 || Number.isNaN(limitVal));

    if (isPaginationRequested && !isUnlimited) {
      const total = enrichedItems.length;
      const pageNum = Math.max(1, Number(opts.page) || 1);
      const limitNum = Math.max(1, limitVal || 10);
      const totalPages = Math.ceil(total / limitNum) || 1;
      const skip = (pageNum - 1) * limitNum;
      const paginatedItems = enrichedItems.slice(skip, skip + limitNum);

      return {
        items: paginatedItems,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      };
    }

    if (isFlat) {
      return enrichedItems;
    }

    // Build hierarchy tree with virtual subItems array for level 1 & level 2 items
    const itemMap = new Map<string, any>();
    enrichedItems.forEach((item: any) => {
      itemMap.set(String(item._id), {
        ...item,
        subItems: [],
      });
    });

    const rootItems: any[] = [];

    enrichedItems.forEach((rawItem: any) => {
      const itemNode = itemMap.get(String(rawItem._id));
      if (rawItem.parentId) {
        const parentNode = itemMap.get(String(rawItem.parentId));
        if (parentNode) {
          parentNode.subItems.push({
            ...itemNode,
            linkUrl: itemNode.targetUrl || itemNode.linkUrl || '',
          });
        } else {
          rootItems.push(itemNode);
        }
      } else {
        rootItems.push(itemNode);
      }
    });

    return rootItems;
  }

  async deleteLegacySubMenus(): Promise<void> {
    await this.menuItemModel.deleteMany({ category: 'SubMenu' }).exec();
    await this.menuItemModel.deleteMany({ $or: [{ menuId: '' }, { menuId: null }] }).exec();
    await this.removeDuplicates();
  }

  async findOne(idOrMenuId: string): Promise<any> {
    const isMongoId = Types.ObjectId.isValid(idOrMenuId);
    const filter = isMongoId
      ? { $or: [{ _id: new Types.ObjectId(idOrMenuId) }, { publicId: idOrMenuId }, { menuId: idOrMenuId }] }
      : { $or: [{ publicId: idOrMenuId }, { menuId: idOrMenuId }, { slug: idOrMenuId }] };

    const item = await this.menuItemModel.findOne(filter).lean().exec();
    if (!item) {
      throw new NotFoundException(
        `MenuItem with ID or menuId "${idOrMenuId}" not found`,
      );
    }

    const children = await this.menuItemModel
      .find({ parentId: item._id } as any)
      .sort({ order: 1 })
      .lean()
      .exec();

    return {
      ...item,
      id: String(item._id),
      subItems: children,
    };
  }

  async update(idOrMenuId: string, updateDto: UpdateMenuItemDto): Promise<any> {
    const isMongoId = Types.ObjectId.isValid(idOrMenuId);
    const filter = isMongoId
      ? { $or: [{ _id: new Types.ObjectId(idOrMenuId) }, { publicId: idOrMenuId }, { menuId: idOrMenuId }] }
      : { $or: [{ publicId: idOrMenuId }, { menuId: idOrMenuId }, { slug: idOrMenuId }] };

    const existing = await this.menuItemModel.findOne(filter).exec();
    if (!existing) {
      throw new NotFoundException(
        `MenuItem with ID/menuId "${idOrMenuId}" not found`,
      );
    }

    const payload: any = { ...updateDto };

    let parentId = existing.parentId;
    let level = existing.level;

    if ('parentId' in payload) {
      const res = await this.resolveParentAndLevel(
        payload.parentId,
        String(existing._id),
      );
      parentId = res.parentId as any;
      level = res.level;
      payload.parentId = parentId;
      payload.level = level;
    }

    const targetTitle = payload.title !== undefined ? payload.title : existing.title;
    const targetCategory = payload.category !== undefined ? payload.category : existing.category;

    await this.checkDuplicateTitle(
      targetTitle,
      parentId as Types.ObjectId | null,
      targetCategory,
      existing._id,
    );

    if (!payload.slug && payload.title) {
      payload.slug = this.generateSlug(payload.title);
    }

    if (!payload.menuId || payload.menuId.trim() === '') {
      delete payload.menuId;
    }

    const updated = await this.menuItemModel
      .findOneAndUpdate(filter, { $set: payload }, { returnDocument: 'after' })
      .exec();

    return updated;
  }

  async remove(idOrMenuId: string): Promise<{ deleted: boolean }> {
    const isMongoId = Types.ObjectId.isValid(idOrMenuId);
    const filter = isMongoId
      ? { $or: [{ _id: new Types.ObjectId(idOrMenuId) }, { publicId: idOrMenuId }, { menuId: idOrMenuId }] }
      : { $or: [{ publicId: idOrMenuId }, { menuId: idOrMenuId }, { slug: idOrMenuId }] };

    const itemToDelete = await this.menuItemModel.findOne(filter).exec();
    if (!itemToDelete) {
      throw new NotFoundException(
        `MenuItem with ID/menuId "${idOrMenuId}" not found`,
      );
    }

    // Cascade delete any children and grandchildren recursively
    const childIds = await this.menuItemModel
      .find({ parentId: itemToDelete._id } as any)
      .distinct('_id');

    if (childIds.length > 0) {
      await this.menuItemModel
        .deleteMany({ parentId: { $in: childIds } } as any)
        .exec();
      await this.menuItemModel
        .deleteMany({ parentId: itemToDelete._id } as any)
        .exec();
    }

    await this.menuItemModel.deleteOne({ _id: itemToDelete._id }).exec();
    return { deleted: true };
  }

  async upsertMany(items: CreateMenuItemDto[]): Promise<any[]> {
    const results: any[] = [];
    for (const item of items) {
      const res = await this.upsertOne(item);
      results.push(res);
    }
    return results;
  }
}
