import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageStrategy, UploadResult } from './storage-strategy.interface';
import { MulterFile } from '../../common/interfaces/multer.interface';

@Injectable()
export class LocalStorageStrategy implements IStorageStrategy {
  private readonly logger = new Logger(LocalStorageStrategy.name);
  private readonly uploadDir = path.join(process.cwd(), 'public', 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file: MulterFile, folder?: string): Promise<UploadResult> {
    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
    const filePath = path.join(this.uploadDir, filename);

    await fs.promises.writeFile(filePath, file.buffer);

    return {
      url: `/uploads/${filename}`,
      key: filename,
      provider: 'local',
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const filePath = path.join(this.uploadDir, key);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return true;
    } catch (err) {
      this.logger.error(`Error deleting local file ${key}`, err);
      return false;
    }
  }
}
