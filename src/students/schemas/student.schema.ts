import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';

export type StudentDocument = Student & Document;

@Schema({ timestamps: true })
export class Student {
  @Prop({
    required: true,
    unique: true,
    index: true,
    default: () => generatePublicId('STU'),
  })
  publicId!: string;

  @Prop({ unique: true, index: true, default: () => generatePublicId('STU') })
  studentId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  grade!: string;

  @Prop({ required: true })
  section!: string;

  @Prop({ required: true })
  dob!: Date;

  @Prop({ required: true })
  gender!: string;

  @Prop()
  house?: string;

  @Prop()
  transportRoute?: string;

  @Prop({ required: true })
  parentName!: string;

  @Prop({ required: true })
  parentPhone!: string;

  @Prop({ required: true })
  parentEmail!: string;

  @Prop({ required: true })
  address!: string;

  @Prop({ enum: ['Active', 'Inactive'], default: 'Active' })
  status!: string;

  @Prop()
  avatar?: string;

  @Prop({ type: [String], default: [] })
  document?: string[];

  @Prop({ default: Date.now })
  enrolledAt!: Date;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
