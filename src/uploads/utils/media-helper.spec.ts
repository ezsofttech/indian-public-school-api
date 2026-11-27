import {
  getMediaBaseUrl,
  toRelativeMediaPath,
  toFullMediaUrl,
  buildCloudinaryMediaUrl,
  transformMediaPathsToFull,
  formatBytes,
  formatFileSizeErrorMessage,
  extractCloudinaryPublicId,
} from './media-helper';

describe('MediaHelper & Cloudinary Utilities', () => {
  beforeAll(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'dnw7mgysa';
    process.env.CLOUDINARY_ROOT_FOLDER = 'ips-education/assets';
    process.env.MEDIA_BASE_URL = 'https://res.cloudinary.com/dnw7mgysa/ips-education/assets';
  });

  const BASE_URL = 'https://res.cloudinary.com/dnw7mgysa/ips-education/assets';

  describe('getMediaBaseUrl', () => {
    it('should return default base URL', () => {
      expect(getMediaBaseUrl()).toBe(BASE_URL);
    });
  });

  describe('toRelativeMediaPath', () => {
    it('should strip Cloudinary domain & asset base prefix from full URL', () => {
      const fullUrl =
        'https://res.cloudinary.com/dnw7mgysa/image/upload/ips-education/assets/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toRelativeMediaPath(fullUrl)).toBe('/Visual%20Editor%20Picked/file_avevn4.png');
    });

    it('should handle full Cloudinary upload URLs', () => {
      const fullUrl =
        'https://res.cloudinary.com/dnw7mgysa/image/upload/v1789163175/ips-education/assets/Home/hero-campus.jpg';
      expect(toRelativeMediaPath(fullUrl)).toBe('/Home/hero-campus.jpg');
    });

    it('should preserve relative paths starting with /', () => {
      const relative = '/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toRelativeMediaPath(relative)).toBe(relative);
    });
  });

  describe('buildCloudinaryMediaUrl & toFullMediaUrl', () => {
    it('should build full Cloudinary URL with cloud domain, upload prefix, root folder, and relative path', () => {
      const relative = '/Settings/Logos/BannerLogo.png';
      expect(buildCloudinaryMediaUrl(relative)).toBe(
        'https://res.cloudinary.com/dnw7mgysa/image/upload/f_auto,q_auto/ips-education/assets/Settings/Logos/BannerLogo.png',
      );
    });

    it('should use /video/upload for video files', () => {
      const relative = '/Videos/campus-tour.mp4';
      expect(buildCloudinaryMediaUrl(relative, 'video/mp4')).toBe(
        'https://res.cloudinary.com/dnw7mgysa/video/upload/ips-education/assets/Videos/campus-tour.mp4',
      );
    });

    it('should normalize legacy Cloudinary URLs from an older cloud name to current configured cloud', () => {
      const legacyUrl = 'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Settings/Icons/Art.png';
      expect(toFullMediaUrl(legacyUrl)).toBe(
        'https://res.cloudinary.com/dnw7mgysa/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Art.png',
      );
    });

    it('should normalize legacy Cloudinary URLs in transformMediaPathsToFull', () => {
      const data = {
        icon: 'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Settings/Icons/Art.png',
        banner: '/Settings/Home/file_abc.png',
      };
      const result = transformMediaPathsToFull(data);
      expect(result.icon).toBe(
        'https://res.cloudinary.com/dnw7mgysa/image/upload/f_auto,q_auto/ips-education/assets/Settings/Icons/Art.png',
      );
      expect(result.banner).toBe(
        'https://res.cloudinary.com/dnw7mgysa/image/upload/f_auto,q_auto/ips-education/assets/Settings/Home/file_abc.png',
      );
    });
  });

  describe('extractCloudinaryPublicId', () => {
    it('should extract public ID correctly from full URL', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/v1234567890/folder/sample.jpg';
      expect(extractCloudinaryPublicId(url)).toBe('folder/sample');
    });

    it('should extract public ID preserving extension when requested', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/v1234567890/folder/sample.jpg';
      expect(extractCloudinaryPublicId(url, true)).toBe('folder/sample.jpg');
    });
  });

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
  });
});
