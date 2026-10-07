import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({
    required: true,
    unique: true,
    index: true,
    default: () => generatePublicId('REV'),
  })
  publicId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  batch?: string;

  @Prop({ required: true, min: 1, max: 5, default: 5 })
  rating!: number;

  @Prop({ required: true })
  feedback!: string;

  @Prop({ default: '/Review/Anonymous.png' })
  avatar!: string;

  @Prop({ default: true })
  isApproved!: boolean;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
