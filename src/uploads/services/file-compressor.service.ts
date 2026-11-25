import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { MulterFile } from '../../common/interfaces/multer.interface';

@Injectable()
export class FileCompressorService {
  private readonly logger = new Logger(FileCompressorService.name);

  /**
   * Compresses incoming uploaded files (PDFs, etc.)
   * Image compression is offloaded to the frontend before upload.
   *
   * Flow safety: If compression fails for any reason or yields a larger buffer,
   * it gracefully falls back to the original uncompressed file buffer.
   */
  async compress(file: MulterFile): Promise<MulterFile> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      return file;
    }

    const originalSize = file.buffer.length;
    const mimetype = (file.mimetype || '').toLowerCase();
    const filename = file.originalname || 'uploaded_file';
    const isPdf = mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

    try {
      let compressedBuffer: Buffer | null = null;

      if (isPdf) {
        compressedBuffer = await this.compressPdf(file.buffer, filename);
      }

      if (compressedBuffer && compressedBuffer.length > 0 && compressedBuffer.length < originalSize) {
        const savedBytes = originalSize - compressedBuffer.length;
        const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);
        const origMB = (originalSize / (1024 * 1024)).toFixed(2);
        const compMB = (compressedBuffer.length / (1024 * 1024)).toFixed(2);

        this.logger.log(
          `Compressed file "${filename}" (${mimetype}): ${origMB} MB -> ${compMB} MB (${savedPercent}% size reduction)`,
        );

        return {
          ...file,
          buffer: compressedBuffer,
          size: compressedBuffer.length,
          originalBuffer: file.buffer,
        };
      }

      return file;
    } catch (err: any) {
      this.logger.warn(
        `File compression skipped for "${filename}" due to warning: ${err?.message || err}. Proceeding with original file.`,
      );
      return file;
    }
  }

  /**
   * PDF document optimization using pdf-lib.
   * Compresses object streams for maximum size reduction on standard PDFs (Google Docs, MS Word, Adobe Acrobat),
   * while adaptively falling back to standard xref packing for generator signatures (e.g. ReportLab)
   * that require uncompressed object streams for Cloudinary rasterization.
   */
  private async compressPdf(buffer: Buffer, filename: string): Promise<Buffer> {
    try {
      const headerSnippet = buffer.toString('latin1', 0, 4096);
      const isReportLab = headerSnippet.includes('ReportLab');
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

      // Apply maximum compression (useObjectStreams: true) for compatible PDFs,
      // and standard xref packing for ReportLab to prevent Cloudinary 'Invalid PDF file' errors
      const compressedBytes = await pdfDoc.save({
        useObjectStreams: !isReportLab,
        addDefaultPage: false,
      });

      return Buffer.from(compressedBytes);
    } catch (err: any) {
      this.logger.warn(`PDF compression warning for ${filename}: ${err?.message || err}`);
      return buffer;
    }
  }
}
