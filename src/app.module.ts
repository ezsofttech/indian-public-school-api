import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { StaffModule } from './staff/staff.module';
import { GalleryModule } from './gallery/gallery.module';
import { SchoolSettingsModule } from './school-settings/school-settings.module';
import { UploadsModule } from './uploads/uploads.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { ReviewsModule } from './reviews/reviews.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { NewsModule } from './news/news.module';
import { RegardingModule } from './regarding/regarding.module';
import { PagesModule } from './pages/pages.module';
import { CareersModule } from './careers/careers.module';
import { ThemeModule } from './theme/theme.module';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://127.0.0.1:27017/indian-public-school',
        ),
      }),
    }),
    AuthModule,
    StudentsModule,
    StaffModule,
    GalleryModule,
    SchoolSettingsModule,
    UploadsModule,
    MenuItemsModule,
    ReviewsModule,
    InquiriesModule,
    NewsModule,
    RegardingModule,
    PagesModule,
    CareersModule,
    ThemeModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

