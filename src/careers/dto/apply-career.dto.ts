import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ApplyCareerDto {
  @ApiProperty({ example: '65f1234567890abcdef12345', description: 'Career post Object ID' })
  @IsString()
  @IsNotEmpty()
  postId: string;

  @ApiProperty({ example: 'Ananya Verma', description: 'Full name of candidate' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'ananya.verma@example.com', description: 'Candidate email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+919876543210', description: 'Candidate phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'I am applying for PGT Physics Teacher with 4 years teaching experience.', description: 'Cover note or message' })
  @IsString()
  @IsOptional()
  coverNote?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/v1234/resume.pdf', description: 'Resume file URL or link' })
  @IsString()
  @IsOptional()
  resumeUrl?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/v1234/photo.jpg', description: 'Applicant photo or image URL' })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional({ example: { notice_period: '1 Month', experience_years: '4' }, description: 'Answers to dynamic application form fields' })
  @IsObject()
  @IsOptional()
  customAnswers?: Record<string, string>;
}
