import 'multer';

export type MulterFile = Express.Multer.File & {
  originalBuffer?: Buffer;
};
