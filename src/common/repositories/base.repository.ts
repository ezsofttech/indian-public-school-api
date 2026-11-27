import { Document, Model } from 'mongoose';
import { IBaseRepository } from '../interfaces/base-repository.interface';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedResult } from '../interfaces/paginated-result.interface';
import { NotFoundException } from '@nestjs/common';

function isObjectId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

export abstract class BaseRepository<
  T extends Document,
> implements IBaseRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  async create(createDto: any): Promise<T> {
    const createdEntity = new this.model(createDto);
    return createdEntity.save() as unknown as Promise<T>;
  }

  async findAll(
    queryDto: PaginationQueryDto = {},
    searchableFields: string[] = ['name', 'title'],
    additionalFilter: Record<string, any> = {},
  ): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      filter,
    } = queryDto || {};

    const queryConditions: Record<string, any>[] = [];

    // Combine additional static filters
    if (additionalFilter && Object.keys(additionalFilter).length > 0) {
      queryConditions.push(additionalFilter);
    }

    // Parse JSON filter if passed as string
    if (filter) {
      try {
        const parsedFilter =
          typeof filter === 'string' ? JSON.parse(filter) : filter;
        queryConditions.push(parsedFilter);
      } catch {
        // Ignore JSON parse errors for non-JSON filter strings
      }
    }

    // Add regex search across searchable fields
    if (search && searchableFields.length > 0) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = searchableFields.map((field) => ({
        [field]: searchRegex,
      }));
      queryConditions.push({ $or: searchConditions });
    }

    const finalQuery: Record<string, any> =
      queryConditions.length > 0 ? { $and: queryConditions } : {};

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(1000, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const sortDirection =
      String(sortOrder).toLowerCase() === 'asc' || String(sortOrder) === '1' ? 1 : -1;
    const sortOptions: Record<string, 1 | -1> = { [sortBy]: sortDirection };

    const [items, total] = await Promise.all([
      this.model
        .find(finalQuery)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.model.countDocuments(finalQuery).exec(),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      items: items as unknown as T[],
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };
  }

  async findById(id: string): Promise<T> {
    const filter = isObjectId(id) ? { _id: id } : { publicId: id };
    const entity = await this.model.findOne(filter).lean().exec();
    if (!entity) {
      throw new NotFoundException(`Entity with ID "${id}" not found`);
    }
    return entity as unknown as T;
  }

  async update(id: string, updateDto: any): Promise<T> {
    const filter = isObjectId(id) ? { _id: id } : { publicId: id };
    const { _id, id: _dummyId, createdAt, updatedAt, __v, ...cleanDto } = updateDto || {};
    const updatedEntity = await this.model
      .findOneAndUpdate(filter, cleanDto, {
        returnDocument: 'after',
        runValidators: false,
      })
      .lean()
      .exec();
    if (!updatedEntity) {
      throw new NotFoundException(`Entity with ID "${id}" not found`);
    }
    return updatedEntity as unknown as T;
  }

  async delete(id: string): Promise<T> {
    const filter = isObjectId(id) ? { _id: id } : { publicId: id };
    const deletedEntity = await this.model.findOneAndDelete(filter).lean().exec();
    if (!deletedEntity) {
      throw new NotFoundException(`Entity with ID "${id}" not found`);
    }
    return deletedEntity as unknown as T;
  }

  async count(filter: Record<string, any> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }
}
