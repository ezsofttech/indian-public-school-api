import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePublicDisclosureConfigDto {
  @ApiPropertyOptional({ example: '330833', description: 'CBSE Affiliation Number' })
  @IsOptional()
  @IsString()
  affiliationNo?: string;

  @ApiPropertyOptional({ example: '65830', description: 'CBSE School Code' })
  @IsOptional()
  @IsString()
  schoolCode?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether to show the compliance notice bar' })
  @IsOptional()
  @IsBoolean()
  showNotice?: boolean;

  @ApiPropertyOptional({
    example:
      "Fields marked [Enter details] and document links are awaiting the school's verified information.",
    description: 'Custom compliance notice / remarks text',
  })
  @IsOptional()
  @IsString()
  complianceNote?: string;
}
