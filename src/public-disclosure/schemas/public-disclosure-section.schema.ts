import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';
import { DisclosureItem, DisclosureSection } from '../interfaces/disclosure.interface';

export type PublicDisclosureSectionDocument = PublicDisclosureSection & Document;

@Schema({ timestamps: true })
export class PublicDisclosureSection implements Partial<DisclosureSection> {
  @Prop({
    required: true,
    unique: true,
    index: true,
    default: () => generatePublicId('DISC'),
  })
  publicId!: string;

  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true,
  })
  sectionKey!: string;

  @Prop({ required: true, trim: true })
  sectionTitle!: string;

  @Prop({ required: true, default: 0, index: true })
  order!: number;

  @Prop({ required: true, default: true, index: true })
  isPublished!: boolean;

  @Prop({ type: Array, default: [] })
  items!: DisclosureItem[];

  @Prop({ default: Date.now })
  createdAt!: Date;

  @Prop({ default: Date.now })
  updatedAt!: Date;
}

export const PublicDisclosureSectionSchema = SchemaFactory.createForClass(PublicDisclosureSection);
