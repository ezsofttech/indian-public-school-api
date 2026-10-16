import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSchoolSettingDto {
  @ApiProperty({ example: 'school_name', description: 'Unique setting key identifier' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiPropertyOptional({ example: 'General', description: 'Setting category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'Indian Public School', description: 'Setting value (string, object, boolean, number, etc.)' })
  @IsNotEmpty()
  value: any;

  @ApiPropertyOptional({ example: 'Official name of the institution', description: 'Description of setting purpose' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Active', description: 'Active status of setting' })
  @IsOptional()
  @IsString()
  status?: string;
}
