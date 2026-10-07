import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';

export enum GalleryEventType {
  GENERAL = 'General',
  DOCUMENTS = 'Documents',
  NEWS = 'News',
  CAMPUS = 'Campus',
  EVENTS = 'Events',
  SPORTS = 'Sports',
  ACTIVITIES = 'Activities',
  HOSTEL = 'Hostel',
  ARTS = 'Arts',
  AWARENESS = 'Awareness',
  CELEBRATION = 'Celebration',
  ACADEMIC = 'Academic',
  INFRASTRUCTURE = 'Infrastructure',
}

export type GalleryDocument = Gallery & Document;

@Schema({ timestamps: true })
export class Gallery {
  @Prop({
    required: false,
    unique: true,
    index: true,
    default: () => generatePublicId('GAL'),
  })
  publicId?: string;

  @Prop({ required: true, trim: true, index: true })
  eventName!: string;

  @Prop({ trim: true, default: GalleryEventType.GENERAL, index: true })
  eventType?: string;

  @Prop({ trim: true, default: '/album/General', index: true })
  directory?: string;

  @Prop({ type: [String], required: false, default: [] })
  fileUrl?: string[];

  @Prop({ trim: true, required: false })
  mimeType?: string;

  @Prop({ type: Date, default: null })
  deletedAt?: Date;
}

export const GallerySchema = SchemaFactory.createForClass(Gallery);

