import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';

export type InquiryDocument = Inquiry & Document;

export enum InquiryStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  RESOLVED = 'Resolved',
  CLOSED = 'Closed',
}

@Schema({ timestamps: true })
export class Inquiry {
  @Prop({
    required: true,
    unique: true,
    index: true,
    default: () => generatePublicId('INQ'),
  })
  publicId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: false, trim: true, default: '' })
  contact!: string;

  @Prop({ required: false, trim: true, lowercase: true, default: '' })
  email!: string;

  @Prop({ required: true, trim: true, default: 'General' })
  inquiryType!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({
    type: String,
    enum: Object.values(InquiryStatus),
    default: InquiryStatus.PENDING,
  })
  status!: string;

  @Prop({ type: [String], default: [] })
  documents?: string[];
}

export const InquirySchema = SchemaFactory.createForClass(Inquiry);
