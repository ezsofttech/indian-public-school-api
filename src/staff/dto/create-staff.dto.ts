import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStaffDto {
  @ApiProperty({ example: 'Dr. Sarah Connor', description: 'Staff full name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'sarah.connor@school.com',
    description: 'Staff official email',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: '+91 9876543210',
    description: 'Staff contact phone number',
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'Science', description: 'Academic department' })
  @IsString()
  @IsNotEmpty()
  department!: string;

  @ApiProperty({ example: 'Teaching', description: 'Staff type' })
  @IsString()
  @IsNotEmpty()
  staffType!: string;

  @ApiProperty({
    example: 'Senior Physics Teacher',
    description: 'Job designation',
  })
  @IsString()
  @IsNotEmpty()
  designation!: string;

  @ApiProperty({
    example: 'Ph.D. in Physics, M.Ed.',
    description: 'Academic qualifications',
  })
  @IsString()
  @IsNotEmpty()
  qualification!: string;

  @ApiProperty({
    example: '2020-08-15',
    description: 'Date of joining (ISO Date string)',
  })
  @IsDateString()
  @IsNotEmpty()
  joinDate!: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/staff.jpg',
    description: 'Avatar photo URL',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/staff_resume.pdf',
    description: 'Staff resume or CV document URL',
  })
  @IsOptional()
  @IsString()
  resume?: string;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/demo/image/upload/v1/staff_document.pdf'],
    description: 'Staff certificates or qualification document URLs',
    type: [String],
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return [];
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim()).map((s) => s.trim());
    return [];
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  document?: string[];

  @ApiPropertyOptional({
    example: 'Active',
    enum: ['Active', 'On Leave', 'Inactive'],
    default: 'Active',
    description: 'Employment status',
  })
  @IsOptional()
  @IsEnum(['Active', 'On Leave', 'Inactive'])
  status?: 'Active' | 'On Leave' | 'Inactive';
}
