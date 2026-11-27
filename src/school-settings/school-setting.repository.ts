import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../common/repositories/base.repository';
import { SchoolSetting, SchoolSettingDocument } from './schemas/school-setting.schema';

@Injectable()
export class SchoolSettingRepository extends BaseRepository<SchoolSettingDocument> {
  constructor(
    @InjectModel(SchoolSetting.name)
    private readonly schoolSettingModel: Model<SchoolSettingDocument>,
  ) {
    super(schoolSettingModel);
  }

  async findByKey(key: string): Promise<SchoolSettingDocument | null> {
    return this.schoolSettingModel.findOne({ key }).lean().exec() as any;
  }

  async findActive(): Promise<SchoolSettingDocument | null> {
    const activeDs = await this.schoolSettingModel.findOne({ key: 'site_datasource', status: 'Active' }).lean().exec();
    if (activeDs) return activeDs as any;

    const ds = await this.schoolSettingModel.findOne({ key: 'site_datasource' }).lean().exec();
    if (ds) return ds as any;

    const active = await this.schoolSettingModel.findOne({ status: 'Active' }).lean().exec();
    if (active) return active as any;

    return null;
  }

  async deactivateOthers(excludeId?: string, category?: string): Promise<any> {
    const query: any = { key: { $ne: 'site_datasource' } };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    if (category) {
      query.category = category;
    }
    return this.schoolSettingModel.updateMany(query, { $set: { status: 'Inactive' } }).exec();
  }

  async deactivateOthersByKey(excludeKey?: string, category?: string): Promise<any> {
    const query: any = { key: { $ne: 'site_datasource' } };
    if (excludeKey) {
      query.key = { $nin: [excludeKey, 'site_datasource'] };
    }
    if (category) {
      query.category = category;
    }
    return this.schoolSettingModel.updateMany(query, { $set: { status: 'Inactive' } }).exec();
  }

  async updatePartialByKey(key: string, setOps: Record<string, any>): Promise<any> {
    return this.schoolSettingModel.updateOne(
      { key },
      { $set: setOps },
      { upsert: true }
    ).exec();
  }
}
