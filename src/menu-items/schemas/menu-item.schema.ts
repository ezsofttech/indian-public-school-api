import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { generatePublicId } from '../../common/utils/public-id';

export type MenuItemDocument = MenuItem & Document;

@Schema({ timestamps: true })
export class MenuItem {
  @Prop({
    required: false,
    unique: true,
    sparse: true,
    index: true,
    default: () => generatePublicId('MENU'),
  })
  publicId!: string;

  @Prop({ required: true, unique: true, index: true })
  menuId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  slug!: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'MenuItem',
    default: null,
    index: true,
  })
  parentId?: MongooseSchema.Types.ObjectId | null;

  @Prop({ default: 1, min: 1, max: 3, index: true })
  level!: number;

  @Prop({ trim: true, default: '' })
  targetUrl?: string;

  @Prop({ trim: true, default: 'Header' })
  category!: string;

  @Prop({ default: 0 })
  order?: number;

  @Prop({ default: true })
  isPublished?: boolean;

  @Prop({ trim: true, default: '' })
  icon?: string;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);
MenuItemSchema.index({ parentId: 1, level: 1, order: 1 });
