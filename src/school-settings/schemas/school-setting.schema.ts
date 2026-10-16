import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SchoolSettingDocument = SchoolSetting & Document;

@Schema({ timestamps: true })
export class SchoolSetting {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ default: 'Content' })
  category!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value!: any;

  @Prop()
  description?: string;

  @Prop({ default: 'Active', enum: ['Active', 'Inactive'] })
  status!: string;
}

export const SchoolSettingSchema = SchemaFactory.createForClass(SchoolSetting);
