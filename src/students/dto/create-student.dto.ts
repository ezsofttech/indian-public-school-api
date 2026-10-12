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

export class CreateStudentDto {
  @ApiProperty({
    example: 'Rahul Sharma',
    description: 'Full name of the student',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Class 10', description: 'Grade/Class level' })
  @IsString()
  @IsNotEmpty()
  grade: string;

  @ApiProperty({ example: 'A', description: 'Class section' })
  @IsString()
  @IsNotEmpty()
  section: string;

  @ApiProperty({
    example: '2010-05-14',
    description: 'Date of birth (ISO date string)',
  })
  @IsDateString()
  @IsNotEmpty()
  dob: string;

  @ApiProperty({ example: 'Male', description: 'Student gender' })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiPropertyOptional({
    example: 'Blue House',
    description: 'School house name',
  })
  @IsOptional()
  @IsString()
  house?: string;

  @ApiPropertyOptional({
    example: 'Route 4 - Sector 62',
    description: 'School bus transport route',
  })
  @IsOptional()
  @IsString()
  transportRoute?: string;

  @ApiProperty({
    example: 'Rajesh Sharma',
    description: 'Parent / Guardian name',
  })
  @IsString()
  @IsNotEmpty()
  parentName: string;

  @ApiProperty({
    example: '+91 9876543210',
    description: 'Parent / Guardian contact phone',
  })
  @IsString()
  @IsNotEmpty()
  parentPhone: string;

  @ApiProperty({
    example: 'rajesh.sharma@gmail.com',
    description: 'Parent / Guardian contact email',
  })
  @IsEmail()
  @IsNotEmpty()
  parentEmail: string;

  @ApiProperty({
    example: '123 Park Street, Sector 15, New Delhi',
    description: 'Residential address',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({
    example: 'Active',
    enum: ['Active', 'Inactive'],
    default: 'Active',
    description: 'Student status',
  })
  @IsOptional()
  @IsEnum(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/student.jpg',
    description: 'Student avatar photo URL',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/demo/image/upload/v1/student_document.pdf'],
    description: 'Student document or marksheet URLs',
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
    example: '2026-04-01',
    description: 'Enrollment date',
  })
  @IsOptional()
  @IsDateString()
  enrolledAt?: string;
}
