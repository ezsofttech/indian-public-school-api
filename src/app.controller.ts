import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get(['', 'health', 'api/v1/health', 'api/health'])
  getHealth(): string {
    return this.appService.getHealth();
  }
}
