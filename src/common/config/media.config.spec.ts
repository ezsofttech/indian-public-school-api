import {
  getMediaBaseUrl,
  toRelativeMediaPath,
  toFullMediaUrl,
  transformMediaUrlsToRelative,
  transformMediaPathsToFull,
} from './media.config';

describe('MediaConfig', () => {
  const BASE_URL = 'https://res.cloudinary.com/niefrrkx/ips-education/assets';

  describe('getMediaBaseUrl', () => {
    it('should return default base URL', () => {
      expect(getMediaBaseUrl()).toBe(BASE_URL);
    });
  });

  describe('toRelativeMediaPath', () => {
    it('should strip Cloudinary domain & asset base prefix from full URL', () => {
      const fullUrl = 'https://res.cloudinary.com/niefrrkx/ips-education/assets/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toRelativeMediaPath(fullUrl)).toBe('/Visual%20Editor%20Picked/file_avevn4.png');
    });

    it('should handle full Cloudinary upload URLs', () => {
      const fullUrl = 'https://res.cloudinary.com/niefrrkx/image/upload/v1789163175/ips-education/assets/Home/hero-campus.jpg';
      expect(toRelativeMediaPath(fullUrl)).toBe('/image/upload/v1789163175/ips-education/assets/Home/hero-campus.jpg');
    });

    it('should sanitize malformed URLs with /ips-education/assets/upload/', () => {
      const malformedUrl = 'https://res.cloudinary.com/niefrrkx/ips-education/assets/upload/v1791186873/ips-education/assets/Student/file_dq6ang.png';
      expect(toRelativeMediaPath(malformedUrl)).toBe('/image/upload/v1791186873/ips-education/assets/Student/file_dq6ang.png');
    });

    it('should preserve relative paths starting with /', () => {
      const relative = '/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toRelativeMediaPath(relative)).toBe(relative);
    });
  });

  describe('toFullMediaUrl', () => {
    it('should attach base URL prefix to relative path', () => {
      const relative = '/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toFullMediaUrl(relative)).toBe(
        'https://res.cloudinary.com/niefrrkx/ips-education/assets/Visual%20Editor%20Picked/file_avevn4.png',
      );
    });

    it('should handle /image/upload/ relative paths correctly', () => {
      const relative = '/image/upload/v1789163175/ips-education/assets/Home/hero-campus.jpg';
      expect(toFullMediaUrl(relative)).toBe(
        'https://res.cloudinary.com/niefrrkx/image/upload/v1789163175/ips-education/assets/Home/hero-campus.jpg',
      );
    });

    it('should sanitize malformed absolute URLs', () => {
      const malformedUrl = 'https://res.cloudinary.com/niefrrkx/ips-education/assets/upload/v1791186873/ips-education/assets/Student/file_dq6ang.png';
      expect(toFullMediaUrl(malformedUrl)).toBe(
        'https://res.cloudinary.com/niefrrkx/image/upload/v1791186873/ips-education/assets/Student/file_dq6ang.png',
      );
    });

    it('should preserve external HTTP/HTTPS URLs', () => {
      const external = 'https://images.unsplash.com/photo-12345';
      expect(toFullMediaUrl(external)).toBe(external);
    });
  });

  describe('transformMediaUrlsToRelative', () => {
    it('should convert object properties with full URLs to relative paths', () => {
      const payload = {
        name: 'Test Student',
        avatarUrl: 'https://res.cloudinary.com/niefrrkx/ips-education/assets/avatar.png',
        nested: {
          fileUrl: ['https://res.cloudinary.com/niefrrkx/ips-education/assets/doc.pdf'],
        },
      };

      const result = transformMediaUrlsToRelative(payload);
      expect(result).toEqual({
        name: 'Test Student',
        avatarUrl: '/avatar.png',
        nested: {
          fileUrl: ['/doc.pdf'],
        },
      });
    });
  });

  describe('transformMediaPathsToFull', () => {
    it('should convert relative media paths in response objects to full URLs', () => {
      const responseData = {
        name: 'Test Student',
        avatarUrl: '/avatar.png',
        nested: {
          fileUrl: ['/doc.pdf'],
        },
      };

      const result = transformMediaPathsToFull(responseData);
      expect(result).toEqual({
        name: 'Test Student',
        avatarUrl: 'https://res.cloudinary.com/niefrrkx/ips-education/assets/avatar.png',
        nested: {
          fileUrl: ['https://res.cloudinary.com/niefrrkx/ips-education/assets/doc.pdf'],
        },
      });
    });
  });
});
