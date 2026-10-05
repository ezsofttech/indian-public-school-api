import { ConfigService } from '@nestjs/config';

/**
 * Returns the base Cloudinary domain without root folder suffix (e.g. https://res.cloudinary.com/niefrrkx).
 */
export function getCloudinaryCloudBaseUrl(configService?: ConfigService): string {
  const cloudName =
    configService?.get<string>('CLOUDINARY_CLOUD_NAME') ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    'niefrrkx';

  return `https://res.cloudinary.com/${cloudName.trim()}`;
}

/**
 * Returns the base URL prefix for media assets without a trailing slash.
 * Default: https://res.cloudinary.com/niefrrkx/ips-education/assets
 */
export function getMediaBaseUrl(configService?: ConfigService): string {
  const envUrl =
    configService?.get<string>('MEDIA_BASE_URL') ||
    process.env.MEDIA_BASE_URL;

  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  const cloudBase = getCloudinaryCloudBaseUrl(configService);
  const rootFolder = getCloudinaryRootFolder(configService);

  return `${cloudBase}/${rootFolder}/assets`;
}

/**
 * Returns the configured root folder in Cloudinary.
 * Default: ips-education
 */
export function getCloudinaryRootFolder(configService?: ConfigService): string {
  const envFolder =
    configService?.get<string>('CLOUDINARY_ROOT_FOLDER') ||
    process.env.CLOUDINARY_ROOT_FOLDER;

  if (envFolder && envFolder.trim()) {
    return envFolder.trim().replace(/^\/+|\/+$/g, '');
  }

  return 'ips-education';
}

/**
 * Format event names to a readable, pretty form (no underscores, hyphens, camelCase split, path deduplication, or trailing index suffixes).
 */
export function formatPrettyEventName(name?: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    return typeof name === 'string' ? name : '';
  }
  let s = name.trim();

  // Handle paths with slashes e.g. "AmarRathore/AmarRathore" => "AmarRathore"
  if (s.includes('/')) {
    const parts = s.split('/').map((p) => p.trim()).filter(Boolean);
    s = parts[parts.length - 1] || s;
  }

  // Remove trailing index numbers like "_1", "_2", "-1", "-2" (e.g. "Art_1" => "Art")
  s = s.replace(/([A-Za-z]+)[_-](\d{1,2})$/g, '$1');

  // Insert space into camelCase (e.g. "AmarRathore" => "Amar Rathore")
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Replace underscores and hyphens with single spaces
  s = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  return s
    .split(' ')
    .map((word) => {
      if (!word) return '';
      if (/^(cbse|noc|ips|pdf|tc|gsc|id|doc)$/i.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Strips the media host / Cloudinary / /assets prefix from a URL to store a clean relative path in DB.
 * E.g. "https://res.cloudinary.com/niefrrkx/ips-education/assets/Gallery/pic.jpg" => "/Gallery/pic.jpg"
 * E.g. "https://res.cloudinary.com/niefrrkx/image/upload/v1234/ips-education/assets/Student/pic.jpg" => "/image/upload/v1234/ips-education/assets/Student/pic.jpg"
 */
export function toRelativeMediaPath(
  urlOrPath: unknown,
  configService?: ConfigService,
): unknown {
  if (typeof urlOrPath !== 'string' || !urlOrPath.trim()) {
    return urlOrPath;
  }

  let trimmed = urlOrPath.trim()
    .replace(/(?:assets\/Videos\/)+assets\/Videos\//gi, 'assets/Videos/')
    .replace(/(?:Videos\/)+Videos\//gi, 'Videos/');

  // If HTTP/HTTPS absolute URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Sanitize any malformed URLs where /assets/upload/ or /ips-education/assets/upload/ was prepended
    trimmed = trimmed
      .replace(/\/(?:ips-education|indian-public-school)\/assets\/upload\//gi, '/image/upload/')
      .replace(/\/assets\/upload\//gi, '/image/upload/')
      .replace(/\/assets\/assets\//gi, '/assets/')
      .replace(/(?:assets\/Videos\/)+assets\/Videos\//gi, 'assets/Videos/');

    try {
      const baseUrl = getMediaBaseUrl(configService);

      if (trimmed.startsWith(baseUrl)) {
        trimmed = trimmed.slice(baseUrl.length);
      } else {
        const cloudBaseUrl = getCloudinaryCloudBaseUrl(configService);
        if (trimmed.startsWith(cloudBaseUrl)) {
          trimmed = trimmed.slice(cloudBaseUrl.length);
        } else {
          const cloudMatch = trimmed.match(
            /^https?:\/\/res\.cloudinary\.com\/[^/]+(\/.*)$/i,
          );
          if (cloudMatch && cloudMatch[1]) {
            trimmed = cloudMatch[1];
          }
        }
      }
    } catch {
      return trimmed;
    }
  }

  if (!trimmed.startsWith('/')) {
    trimmed = '/' + trimmed;
  }

  // Only strip root folder / assets if it's NOT an /image/upload, /video/upload, /raw/upload, or /upload path
  if (!/^\/(?:image|video|raw)?\/?upload\//i.test(trimmed)) {
    trimmed = trimmed
      .replace(/^\/(ips-education|indian-public-school)\/assets\//i, '/')
      .replace(/^\/(ips-education|indian-public-school)\//i, '/')
      .replace(/^\/assets\//i, '/');
  }

  return trimmed;
}

/**
 * Attaches the media base URL prefix to a relative media path for API responses.
 * Ensures valid Cloudinary delivery URLs without malformed prefix duplication.
 */
export function toFullMediaUrl(
  pathOrUrl: unknown,
  configService?: ConfigService,
): unknown {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) {
    return pathOrUrl;
  }

  let trimmed = pathOrUrl.trim()
    .replace(/(?:assets\/Videos\/)+assets\/Videos\//gi, 'assets/Videos/')
    .replace(/(?:Videos\/)+Videos\//gi, 'Videos/');

  // If already absolute URL, clean any accidental malformed patterns inside URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
      .replace(/\/(?:ips-education|indian-public-school)\/assets\/upload\//gi, '/image/upload/')
      .replace(/\/assets\/upload\//gi, '/image/upload/')
      .replace(/\/assets\/assets\//gi, '/assets/')
      .replace(/(?:assets\/Videos\/)+assets\/Videos\//gi, 'assets/Videos/');
  }

  const cloudBaseUrl = getCloudinaryCloudBaseUrl(configService);

  // If path starts with /image/upload/, /video/upload/, /raw/upload/, /upload/
  if (/^\/(?:image|video|raw)\/upload\//i.test(trimmed)) {
    return `${cloudBaseUrl}${trimmed}`;
  }

  if (/^\/upload\//i.test(trimmed)) {
    return `${cloudBaseUrl}/image${trimmed}`;
  }

  const baseUrl = getMediaBaseUrl(configService);

  // If baseUrl already ends with '/assets' (case-insensitive)
  if (baseUrl.toLowerCase().endsWith('/assets')) {
    trimmed = trimmed
      .replace(/^\/(ips-education|indian-public-school)\/assets\//i, '/')
      .replace(/^\/(ips-education|indian-public-school)\//i, '/')
      .replace(/^\/assets\//i, '/')
      .replace(/^assets\//i, '/');
  } else if (baseUrl.toLowerCase().includes('/ips-education')) {
    trimmed = trimmed.replace(/^\/(ips-education|indian-public-school)\//i, '/');
  }

  if (!trimmed.startsWith('/')) {
    trimmed = '/' + trimmed;
  }

  return `${baseUrl}${trimmed}`;
}

const MEDIA_FILE_EXTENSIONS =
  /\.(png|jpg|jpeg|gif|webp|svg|pdf|mp4|webm|mov|doc|docx|xls|xlsx|csv|zip)$/i;

const MEDIA_PROPERTY_KEYS = new Set([
  'fileUrl',
  'url',
  'avatar',
  'avatarUrl',
  'profileImageUrl',
  'marksheetUrl',
  'imageUrl',
  'photo',
  'logo',
  'banner',
  'attachment',
  'attachmentUrl',
  'resume',
  'file',
  'heroImage',
  'thumbnail',
  'coverImage',
  'mediaUrl',
  'icon',
  'src',
  'path',
]);

/**
 * Recursively strip prefixes from full media URLs to relative paths (for Request processing).
 */
export function transformMediaUrlsToRelative<T>(
  obj: T,
  configService?: ConfigService,
  seen = new WeakSet<object>(),
  depth = 0,
  parentKey?: string,
): T {
  if (obj === null || obj === undefined || depth > 15) return obj;

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    const isAbsoluteMediaUrl =
      trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const isMediaProp = parentKey && MEDIA_PROPERTY_KEYS.has(parentKey);
    const isMediaExt = MEDIA_FILE_EXTENSIONS.test(trimmed);
    const isMediaPrefix =
      trimmed.startsWith('/ips-education') ||
      trimmed.startsWith('/indian-public-school') ||
      trimmed.startsWith('/assets/');

    if (isAbsoluteMediaUrl || isMediaProp || isMediaExt || isMediaPrefix) {
      return toRelativeMediaPath(trimmed, configService) as unknown as T;
    }
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      transformMediaUrlsToRelative(item, configService, seen, depth + 1, parentKey),
    ) as unknown as T;
  }

  if (typeof obj === 'object') {
    if (seen.has(obj as object)) return obj;
    const constructorName = (obj as any).constructor?.name;
    if (
      constructorName &&
      constructorName !== 'Object' &&
      constructorName !== 'Array'
    ) {
      return obj;
    }
    seen.add(obj as object);

    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'eventName' && typeof value === 'string') {
        transformed[key] = formatPrettyEventName(value);
      } else {
        transformed[key] = transformMediaUrlsToRelative(
          value,
          configService,
          seen,
          depth + 1,
          key,
        );
      }
    }
    return transformed as unknown as T;
  }

  return obj;
}

/**
 * Recursively attach prefixes to relative media paths (for Response processing) and format eventName.
 */
export function transformMediaPathsToFull<T>(
  obj: T,
  configService?: ConfigService,
  seen = new WeakSet<object>(),
  depth = 0,
  parentKey?: string,
): T {
  if (obj === null || obj === undefined || depth > 15) return obj;

  if (typeof obj === 'string') {
    if (parentKey === 'eventName') {
      return formatPrettyEventName(obj) as unknown as T;
    }

    const trimmed = obj.trim();
    if (trimmed.startsWith('/')) {
      const rootFolder = getCloudinaryRootFolder(configService);
      const isMediaPrefix =
        trimmed.startsWith(`/${rootFolder}`) ||
        trimmed.startsWith('/ips-education') ||
        trimmed.startsWith('/indian-public-school') ||
        trimmed.startsWith('/assets') ||
        trimmed.startsWith('/Gallery') ||
        trimmed.startsWith('/Album') ||
        trimmed.startsWith('/Documents') ||
        trimmed.startsWith('/Settings') ||
        trimmed.startsWith('/Videos') ||
        trimmed.startsWith('/image/upload') ||
        trimmed.startsWith('/uploads');

      const isMediaExt = MEDIA_FILE_EXTENSIONS.test(trimmed);
      const isMediaProp = parentKey && MEDIA_PROPERTY_KEYS.has(parentKey);

      if (isMediaPrefix || isMediaExt || isMediaProp) {
        return toFullMediaUrl(trimmed, configService) as unknown as T;
      }
    }
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      transformMediaPathsToFull(item, configService, seen, depth + 1, parentKey),
    ) as unknown as T;
  }

  if (typeof obj === 'object') {
    if (seen.has(obj as object)) return obj;
    const constructorName = (obj as any).constructor?.name;
    if (
      constructorName &&
      constructorName !== 'Object' &&
      constructorName !== 'Array'
    ) {
      return obj;
    }
    seen.add(obj as object);

    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'eventName' && typeof value === 'string') {
        transformed[key] = formatPrettyEventName(value);
      } else {
        transformed[key] = transformMediaPathsToFull(
          value,
          configService,
          seen,
          depth + 1,
          key,
        );
      }
    }
    return transformed as unknown as T;
  }

  return obj;
}

