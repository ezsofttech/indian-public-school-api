import { MulterFile } from '../../common/interfaces/multer.interface';

export interface UploadResult {
  url: string;
  key: string;
  provider: 'cloudinary' | 'local' | 's3' | 'r2';
  mimeType?: string;
}

export interface IStorageStrategy {
  uploadFile(file: MulterFile, folder?: string): Promise<UploadResult>;
  deleteFile(key: string): Promise<boolean>;
}
