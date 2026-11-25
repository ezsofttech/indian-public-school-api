import { formatBytes, formatFileSizeErrorMessage } from './cloudinary-helper';

describe('Cloudinary Helper Utilities', () => {
  describe('formatBytes', () => {
    it('should format raw bytes strictly in appropriate units', () => {
      expect(formatBytes(10485760)).toBe('10 MB');
      expect(formatBytes(69974235)).toBe('66.73 MB');
      expect(formatBytes(524288)).toBe('512 KB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('formatFileSizeErrorMessage', () => {
    it('should convert byte numbers in Cloudinary error messages to MB format with raw bytes in brackets', () => {
      const input = 'File size too large. Got 69974235. Maximum is 10485760.';
      const output = formatFileSizeErrorMessage(input);
      expect(output).toBe('File size too large. Got 66.73 MB (69,974,235 bytes). Maximum is 10 MB (10,485,760 bytes).');
    });

    it('should prevent double-formatting bugs if called multiple times', () => {
      const input = 'File size too large. Got 69974235. Maximum is 10485760.';
      const firstPass = formatFileSizeErrorMessage(input);
      const secondPass = formatFileSizeErrorMessage(firstPass);
      expect(secondPass).toBe('File size too large. Got 66.73 MB (69,974,235 bytes). Maximum is 10 MB (10,485,760 bytes).');
    });
  });
});
