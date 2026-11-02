import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../common/repositories/base.repository';
import { Gallery, GalleryDocument } from './schemas/gallery.schema';

@Injectable()
export class GalleryRepository extends BaseRepository<GalleryDocument> {
  constructor(
    @InjectModel(Gallery.name)
    private readonly galleryModel: Model<GalleryDocument>,
  ) {
    super(galleryModel);
  }

  async cleanupFileUrl(url: string): Promise<number> {
    if (!url || typeof url !== 'string') return 0;
    const cleanUrl = url.trim();
    if (!cleanUrl) return 0;

    const relativeUrl = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;
    const filename = cleanUrl.split('/').pop()?.split('?')[0];

    const matchConditions: any[] = [
      { fileUrl: cleanUrl },
      { fileUrl: relativeUrl },
    ];
    if (filename && filename.length > 5) {
      const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchConditions.push({ fileUrl: { $regex: escaped, $options: 'i' } });
    }

    try {
      const docs = await this.galleryModel.find({ $or: matchConditions }).exec();
      let affectedCount = 0;
      for (const doc of docs) {
        const remainingUrls = (doc.fileUrl || []).filter(
          (u) => u !== cleanUrl && u !== relativeUrl && (!filename || !u.includes(filename)),
        );
        if (remainingUrls.length === 0) {
          await this.galleryModel.findByIdAndDelete(doc._id).exec();
        } else {
          doc.fileUrl = remainingUrls;
          await doc.save();
        }
        affectedCount++;
      }
      return affectedCount;
    } catch {
      return 0;
    }
  }
}
