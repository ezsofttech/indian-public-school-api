import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CareerApplicationDocument = CareerApplication & Document;

export enum ApplicationCandidateStatus {
  PENDING = 'PENDING',
  SHORTLISTED = 'SHORTLISTED',
  REJECTED = 'REJECTED',
  HIRED = 'HIRED',
}

@Schema({ timestamps: true })
export class CareerApplication {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CareerPost', required: true })
  postId: string;

  @Prop({ required: true, trim: true })
  postTitle: string;

  @Prop({ required: true, trim: true, unique: true })
  applicationNo: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ default: '' })
  coverNote: string;

  @Prop({ default: '' })
  resumeUrl: string;

  @Prop({ default: '' })
  photoUrl: string;

  @Prop({ type: Object, default: {} })
  customAnswers: Record<string, string>;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({
    type: String,
    enum: ApplicationCandidateStatus,
    default: ApplicationCandidateStatus.PENDING,
  })
  status: ApplicationCandidateStatus;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const CareerApplicationSchema = SchemaFactory.createForClass(CareerApplication);
