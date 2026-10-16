import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PublicDisclosureConfigDocument = PublicDisclosureConfig & Document;

@Schema({ timestamps: true })
export class PublicDisclosureConfig {
  @Prop({ default: '330833' })
  affiliationNo!: string;

  @Prop({ default: '65830' })
  schoolCode!: string;

  @Prop({ default: true })
  showNotice!: boolean;

  @Prop({
    default:
      "Fields marked [Enter details] and document links are awaiting the school's verified information.",
  })
  complianceNote!: string;
}

export const PublicDisclosureConfigSchema =
  SchemaFactory.createForClass(PublicDisclosureConfig);
