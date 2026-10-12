import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';

export type StaffDocument = Staff & Document;

@Schema({ timestamps: true })
export class Staff {
  @Prop({
    required: true,
    unique: true,
    index: true,
    default: () => generatePublicId('STF'),
  })
  publicId!: string;

  @Prop({ unique: true, index: true, default: () => generatePublicId('STF') })
  employeeId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  phone!: string;

  @Prop({ required: true })
  department!: string;

  @Prop({ required: true })
  staffType!: string;

  @Prop({ required: true })
  designation!: string;

  @Prop({ required: true })
  qualification!: string;

  @Prop({ required: true })
  joinDate!: Date;

  @Prop()
  avatar?: string;

  @Prop()
  resume?: string;

  @Prop({ type: [String], default: [] })
  document?: string[];

  @Prop({ enum: ['Active', 'On Leave', 'Inactive'], default: 'Active' })
  status!: string;
}

export const StaffSchema = SchemaFactory.createForClass(Staff);
