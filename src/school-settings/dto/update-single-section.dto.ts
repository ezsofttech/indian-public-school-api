import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class UpdateSingleSectionDto {
  @ApiProperty({
    description: 'Section data payload to update (can be an object or an array depending on section type)',
    example: {
      heading: 'Welcome to Indian Public School',
      description: 'Inspiring excellence in academics and character building.',
      redirectUrl: '/about',
    },
  })
  @IsNotEmpty()
  value: any;
}
