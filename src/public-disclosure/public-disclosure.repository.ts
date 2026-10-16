import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../common/repositories/base.repository';
import {
  PublicDisclosureSection,
  PublicDisclosureSectionDocument,
} from './schemas/public-disclosure-section.schema';

@Injectable()
export class PublicDisclosureRepository extends BaseRepository<PublicDisclosureSectionDocument> {
  constructor(
    @InjectModel(PublicDisclosureSection.name)
    private readonly sectionModel: Model<PublicDisclosureSectionDocument>,
  ) {
    super(sectionModel);
  }

  async findBySectionKey(
    sectionKey: string,
  ): Promise<PublicDisclosureSectionDocument | null> {
    const key = sectionKey.trim().toUpperCase();
    return this.sectionModel
      .findOne({ sectionKey: key })
      .lean()
      .exec() as Promise<PublicDisclosureSectionDocument | null>;
  }

  async findAllOrdered(
    filter: Record<string, any> = {},
  ): Promise<PublicDisclosureSectionDocument[]> {
    return this.sectionModel
      .find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async updateOrder(id: string, order: number): Promise<void> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId ? { _id: id } : { publicId: id };
    await this.sectionModel.updateOne(filter, { $set: { order } }).exec();
  }
}
