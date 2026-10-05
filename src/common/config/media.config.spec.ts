import {
  getMediaBaseUrl,
  toRelativeMediaPath,
  toFullMediaUrl,
  buildCloudinaryMediaUrl,
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
      const fullUrl = 'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toRelativeMediaPath(fullUrl)).toBe('/Visual%20Editor%20Picked/file_avevn4.png');
    });

    it('should handle full Cloudinary upload URLs', () => {
      const fullUrl = 'https://res.cloudinary.com/niefrrkx/image/upload/v1789163175/ips-education/assets/Home/hero-campus.jpg';
      expect(toRelativeMediaPath(fullUrl)).toBe('/Home/hero-campus.jpg');
    });

    it('should preserve relative paths starting with /', () => {
      const relative = '/Visual%20Editor%20Picked/file_avevn4.png';
      expect(toRelativeMediaPath(relative)).toBe(relative);
    });
  });

  describe('buildCloudinaryMediaUrl', () => {
    it('should build full Cloudinary URL with cloud domain, upload prefix, root folder, and mongo relative path', () => {
      const relative = '/Settings/Logos/IPSStandardLogo.png';
      expect(buildCloudinaryMediaUrl(relative)).toBe(
        'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Settings/Logos/IPSStandardLogo.png',
      );
    });

    it('should use /video/upload for video files', () => {
      const relative = '/Videos/campus-tour.mp4';
      expect(buildCloudinaryMediaUrl(relative, 'video/mp4')).toBe(
        'https://res.cloudinary.com/niefrrkx/video/upload/ips-education/assets/Videos/campus-tour.mp4',
      );
    });
  });

  describe('toFullMediaUrl', () => {
    it('should construct clean full Cloudinary URL', () => {
      const relative = '/Settings/Logos/IPSStandardLogo.png';
      expect(toFullMediaUrl(relative)).toBe(
        'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/Settings/Logos/IPSStandardLogo.png',
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
        avatarUrl: 'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/avatar.png',
        nested: {
          fileUrl: ['https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/doc.pdf'],
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
    it('should convert relative media paths in response objects to clean full Cloudinary URLs', () => {
      const responseData = {
        name: 'Test Student',
        avatarUrl: '/avatar.png',
        mimeType: 'image/png',
        nested: {
          fileUrl: ['/doc.pdf'],
        },
      };

      const result = transformMediaPathsToFull(responseData);
      expect(result).toEqual({
        name: 'Test Student',
        avatarUrl: 'https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/avatar.png',
        mimeType: 'image/png',
        nested: {
          fileUrl: ['https://res.cloudinary.com/niefrrkx/image/upload/ips-education/assets/doc.pdf'],
        },
      });
    });
  });
});
