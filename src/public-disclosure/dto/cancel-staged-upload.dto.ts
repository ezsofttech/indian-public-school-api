import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CancelStagedUploadDto {
  @ApiProperty({ description: 'Uploaded URL or path to discard' })
  @IsNotEmpty({ message: 'URL is required' })
  @IsString()
  url!: string;

  @ApiProperty({ description: 'Client session ID' })
  @IsNotEmpty({ message: 'Session ID is required' })
  @IsString()
  sessionId!: string;
}
