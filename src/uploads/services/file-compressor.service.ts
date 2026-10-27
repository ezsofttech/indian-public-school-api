import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

@Injectable()
export class FileCompressorService {
  private readonly logger = new Logger(FileCompressorService.name);

  /**
   * Compresses incoming uploaded files (images, PDFs, videos) visually losslessly
   * to fit within Cloudinary's 10MB raw/media upload limits.
   *
   * Flow safety: If compression fails for any reason or yields a larger buffer,
   * it gracefully falls back to the original uncompressed file buffer.
   */
  async compress(file: Express.Multer.File): Promise<Express.Multer.File> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      return file;
    }

    const originalSize = file.buffer.length;
    const mimetype = (file.mimetype || '').toLowerCase();
    const filename = file.originalname || 'uploaded_file';
    const isPdf = mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
    const isImage = mimetype.startsWith('image/');
    const isVideo = mimetype.startsWith('video/');

    try {
      let compressedBuffer: Buffer | null = null;

      if (isImage) {
        compressedBuffer = await this.compressImage(file.buffer, mimetype, filename);
      } else if (isPdf) {
        compressedBuffer = await this.compressPdf(file.buffer, filename);
      } else if (isVideo) {
        compressedBuffer = await this.compressVideo(file.buffer, filename);
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
        } as Express.Multer.File & { originalBuffer?: Buffer };
      }

      this.logger.log(
        `File "${filename}" (${(originalSize / (1024 * 1024)).toFixed(2)} MB) is already optimal or compression did not yield size savings. Retaining original buffer.`,
      );
      return file;
    } catch (err: any) {
      this.logger.warn(
        `File compression skipped for "${filename}" due to warning: ${err?.message || err}. Proceeding with original file.`,
      );
      return file;
    }
  }

  /**
   * Visually lossless image compression using sharp
   */
  private async compressImage(buffer: Buffer, mimetype: string, filename: string): Promise<Buffer> {
    try {
      let pipeline = sharp(buffer, { animated: mimetype.includes('gif') });
      const metadata = await pipeline.metadata();

      // Downscale ultra-high resolution images (> 2560px) while maintaining aspect ratio
      if (metadata.width && metadata.height && (metadata.width > 2560 || metadata.height > 2560)) {
        pipeline = pipeline.resize(2560, 2560, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      if (mimetype.includes('jpeg') || mimetype.includes('jpg')) {
        return await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      }

      if (mimetype.includes('png')) {
        try {
          return await pipeline.png({ compressionLevel: 8, palette: true, quality: 85 }).toBuffer();
        } catch {
          return await pipeline.png({ compressionLevel: 8 }).toBuffer();
        }
      }

      if (mimetype.includes('webp')) {
        return await pipeline.webp({ quality: 82 }).toBuffer();
      }

      if (mimetype.includes('gif')) {
        return await pipeline.gif().toBuffer();
      }

      // Default image fallback (e.g. avif, tiff)
      return await pipeline.toBuffer();
    } catch (err: any) {
      this.logger.warn(`Sharp image compression warning for ${filename}: ${err?.message || err}`);
      return buffer;
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

  /**
   * Video file compression fallback / pass-through
   */
  private async compressVideo(buffer: Buffer, filename: string): Promise<Buffer> {
    // Return original buffer safely for video files if no dedicated binary processor is active
    this.logger.debug(`Video file uploaded: ${filename} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
    return buffer;
  }
}
