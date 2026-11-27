import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryStorageStrategy } from './strategies/cloudinary-storage.strategy';
// import { LocalStorageStrategy } from './strategies/local-storage.strategy';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { GalleryModule } from '../gallery/gallery.module';
import { FileCompressorService } from './services/file-compressor.service';

@Module({
  imports: [ConfigModule, forwardRef(() => GalleryModule)],
  controllers: [UploadsController],
  providers: [
    CloudinaryStorageStrategy,
    // LocalStorageStrategy,
    UploadsService,
    FileCompressorService,
  ],
  exports: [UploadsService, FileCompressorService],
})
export class UploadsModule {}


