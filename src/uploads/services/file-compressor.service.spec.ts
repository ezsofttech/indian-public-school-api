import { FileCompressorService } from './file-compressor.service';

describe('FileCompressorService', () => {
  let service: FileCompressorService;

  beforeEach(() => {
    service = new FileCompressorService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return original file if buffer is empty or missing', async () => {
    const emptyFile = {
      fieldname: 'file',
      originalname: 'empty.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 0,
      buffer: Buffer.from(''),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const result = await service.compress(emptyFile);
    expect(result.buffer.length).toBe(0);
  });

  it('should handle uncompressed small buffer gracefully', async () => {
    const mockFile = {
      fieldname: 'file',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from('1234567890'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const result = await service.compress(mockFile);
    expect(result).toBeDefined();
    expect(result.buffer).toBeDefined();
    expect(result.buffer.toString()).toBe('1234567890');
  });
});
