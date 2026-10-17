import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { InquiryStatus } from '../schemas/inquiry.schema';

export class CreateInquiryDto {
  @ApiProperty({ example: 'Rahul Sharma', description: 'Name of person submitting inquiry' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '+919876543210', description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  contact?: string;

  @ApiPropertyOptional({ example: 'rahul.sharma@example.com', description: 'Email address' })
  @IsOptional()
  @ValidateIf((o) => typeof o.email === 'string' && o.email.trim() !== '')
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Admission', description: 'Category or type of inquiry (e.g. Admission, Fee Structure, General, Transport)' })
  @IsString()
  @IsNotEmpty()
  inquiryType: string;

  @ApiProperty({
    example: 'I would like to inquire about Class 11 admission criteria and fee structure for the session 2026-27.',
    description: 'Detailed message or query from the user',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    example: InquiryStatus.PENDING,
    enum: InquiryStatus,
    default: InquiryStatus.PENDING,
    description: 'Current status of the inquiry',
  })
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    description: 'List of uploaded document URLs attached to this inquiry',
  })
  @IsOptional()
  @IsString({ each: true })
  documents?: string[];
}
