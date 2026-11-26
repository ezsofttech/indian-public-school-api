import { ConfigService } from '@nestjs/config';

/**
 * =========================================================================
 * 1. Cloudinary Domain & Root Folder Resolution
 * =========================================================================
 */

/**
 * Returns the base Cloudinary domain dynamically from configuration or environment.
 */
/**
 * Returns the base Cloudinary domain dynamically using the exact CLOUDINARY_CLOUD_NAME.
 */
export function getCloudinaryCloudBaseUrl(configService?: ConfigService): string {
  const cloudName = (
    configService?.get<string>('CLOUDINARY_CLOUD_NAME') ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    ''
  ).trim();

  return cloudName ? `https://res.cloudinary.com/${cloudName}` : '';
}

/**
 * Returns the configured root folder dynamically using the exact CLOUDINARY_ROOT_FOLDER.
 */
export function getCloudinaryRootFolder(configService?: ConfigService): string {
  return (
    configService?.get<string>('CLOUDINARY_ROOT_FOLDER') ||
    process.env.CLOUDINARY_ROOT_FOLDER ||
    ''
  )
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Returns the base URL prefix for media assets dynamically using the exact MEDIA_BASE_URL.
 */
export function getMediaBaseUrl(configService?: ConfigService): string {
  const envUrl = (
    configService?.get<string>('MEDIA_BASE_URL') ||
    process.env.MEDIA_BASE_URL ||
    ''
  ).trim();

  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  const cloudBase = getCloudinaryCloudBaseUrl(configService);
  const rootFolder = getCloudinaryRootFolder(configService);

  return rootFolder ? `${cloudBase}/${rootFolder}` : cloudBase;
}

/**
 * =========================================================================
 * 2. Cloudinary Public ID Extraction & Byte Formatting
 * =========================================================================
 */

/**
 * Extract Cloudinary public ID from a Cloudinary URL string.
 * Examples:
 * https://res.cloudinary.com/demo/image/upload/v1234567890/folder/sample.jpg -> folder/sample
 * https://res.cloudinary.com/demo/image/upload/sample.png -> sample
 */
export function extractCloudinaryPublicId(url: string, preserveExtension: boolean = false): string | null {
  if (!url || typeof url !== 'string') return null;

  const decodedUrl = decodeURIComponent(url);

  // If it's a full Cloudinary URL with /upload/
  if (preserveExtension) {
    const matchWithExt = decodedUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (matchWithExt && matchWithExt[1]) {
      return matchWithExt[1];
    }
  }

  const match = decodedUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (match && match[1]) {
    return match[1];
  }

  // If it's already a Cloudinary public ID or key without http(s)://
  if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
    const cleanPath = decodedUrl.replace(/^\/+/, '');
    if (preserveExtension) return cleanPath;
    return cleanPath.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  // Fallback: extract last filename part if full URL couldn't match /upload/
  const parts = decodedUrl.split('/');
  const filename = parts[parts.length - 1];
  if (filename) {
    if (preserveExtension) return filename;
    return filename.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  return null;
}

/**
 * Format raw byte numbers strictly into MB format.
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i <= 0) return `${bytes} Bytes`;
  if (i === 1) return `${parseFloat((bytes / k).toFixed(dm))} KB`;

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format file size error messages from Cloudinary or storage providers into human-readable MB units,
 * preserving the raw server byte count inside brackets.
 */
export function formatFileSizeErrorMessage(errorMessage?: string): string {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return 'File size exceeds maximum permitted limit.';
  }

  if (errorMessage.includes(' (')) {
    return errorMessage;
  }

  return errorMessage.replace(/(?:Got|is)\s+(\d{6,12})/gi, (match, digits) => {
    const num = parseInt(digits, 10);
    if (!isNaN(num) && num > 0) {
      const formattedMb = formatBytes(num);
      const prefix = match.split(/\s+/)[0];
      return `${prefix} ${formattedMb} (${num.toLocaleString('en-US')} bytes)`;
    }
    return match;
  });
}

/**
 * Format event names to a readable, pretty form.
 */
export function formatPrettyEventName(name?: unknown): string {
  if (typeof name !== 'string' || !name.trim()) return typeof name === 'string' ? name : '';
  let s = name.trim();

  if (s.includes('/')) {
    const parts = s.split('/').map((p) => p.trim()).filter(Boolean);
    s = parts[parts.length - 1] || s;
  }

  s = s.replace(/([A-Za-z]+)[_-](\d{1,2})$/g, '$1');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  return s
    .split(' ')
    .map((word) => {
      if (!word) return '';
      if (/^(cbse|noc|ips|pdf|tc|gsc|id|doc)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * =========================================================================
 * 3. URL Transformation (Relative DB Paths <-> Full Cloudinary CDN URLs)
 * =========================================================================
 */

/**
 * Strips host, upload prefix, and root folder from a URL to store a clean relative path in DB.
 */
export function toRelativeMediaPath(pathOrUrl: unknown, configService?: ConfigService): unknown {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) return pathOrUrl;

  const path = pathOrUrl.trim();
  if (!path.startsWith('http://') && !path.startsWith('https://')) {
    if (path.startsWith('/')) return path;
    return `/${path}`;
  }

  // External link (e.g. https://www.cbse.gov.in) -> preserve untouched!
  if (!path.includes('res.cloudinary.com')) {
    return path;
  }

  // Fast direct extraction from Cloudinary URLs (single-pass)
  const rootFolder = getCloudinaryRootFolder(configService);
  const rootPath = rootFolder
    ? rootFolder.toLowerCase().replace(/\/+$/, '').endsWith('/assets')
      ? rootFolder
      : `${rootFolder}/assets`
    : 'assets';
  const escapedRootPath = rootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedFolder = rootFolder ? rootFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  const folderPattern = escapedFolder ? `${escapedRootPath}|${escapedFolder}\\/assets|assets` : `${escapedRootPath}|assets`;
  const fastMatch = path.match(new RegExp(`\\/(?:${folderPattern})\\/(.+)$`, 'i'));
  if (fastMatch?.[1]) {
    const cleanSub = fastMatch[1].replace(/\.pdf\.pdf(?=($|\?|#))/gi, '.pdf').replace(/^\/+/, '');
    return `/${cleanSub}`;
  }

  // Fallback cleanup
  let clean = path.replace(/^https?:\/\/[^\/]+/i, '');
  clean = clean
    .replace(/^\/(?:(?:image|video|raw)\/upload\/)+/i, '/')
    .replace(/^\/(?:[a-z]{1,4}_[a-zA-Z0-9_.-]+(?:,[a-z]{1,4}_[a-zA-Z0-9_.-]+)*\/)+/i, '/')
    .replace(/^\/v\d+\//i, '/');

  if (escapedFolder) {
    clean = clean.replace(new RegExp(`^\\/(?:${escapedFolder})(?:\\/assets\\/)?`, 'i'), '/');
  }

  clean = clean
    .replace(/^\/[a-zA-Z0-9_-]+\/assets\//i, '/')
    .replace(/^\/assets\/assets\//i, '/')
    .replace(/^\/assets\//i, '/')
    .replace(/\.pdf\.pdf(?=($|\?|#))/gi, '.pdf');

  return clean.startsWith('/') ? clean : `/${clean}`;
}

const RE_UPLOAD_PREFIXES = /^\/(?:(?:image|video|raw)\/upload\/)+/i;
const RE_TRANSFORMATIONS = /^\/(?:[a-z]{1,4}_[a-zA-Z0-9_.-]+(?:,[a-z]{1,4}_[a-zA-Z0-9_.-]+)*\/)+/i;
const RE_VERSION = /^\/v\d+\//i;
const RE_LEGACY_IPS_ROOTS = /^\/(?:ips-edu|ips-education|ips-school)\/(?:assets\/)?/i;
const RE_CUSTOM_ASSETS = /^\/[a-zA-Z0-9_-]+\/assets\//i;
const RE_DOUBLE_ASSETS = /^\/assets\/assets\//i;
const RE_SINGLE_ASSETS = /^\/assets\//i;
const RE_DOUBLE_PDF = /\.pdf\.pdf(?=($|\?|#))/gi;

/**
 * Clean, centralized helper to construct full Cloudinary URL dynamically for API responses.
 * Formula: [Cloudinary Domain] + [Upload Prefix] + [CLOUDINARY_ROOT_FOLDER] + [Relative Path]
 */
export function toFullMediaUrl(
  pathOrUrl: unknown,
  mimeTypeOrConfig?: string | ConfigService,
  configService?: ConfigService,
): unknown {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) return pathOrUrl;

  let path = pathOrUrl.trim();
  const cfg = typeof mimeTypeOrConfig === 'object' ? mimeTypeOrConfig : configService;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (path.includes('res.cloudinary.com')) {
      if (
        path.includes('/image/upload/') &&
        !path.includes('/image/upload/f_auto') &&
        !path.includes('f_auto') &&
        !path.includes('/raw/upload/') &&
        !/\.pdf($|\?|#)/i.test(path)
      ) {
        return path.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
      }
    }
    return path;
  }

  const mimeType = typeof mimeTypeOrConfig === 'string' ? mimeTypeOrConfig : undefined;

  const cloudBase = getCloudinaryCloudBaseUrl(cfg);
  const rootFolder = getCloudinaryRootFolder(cfg);
  const rootPath = rootFolder.toLowerCase().replace(/\/+$/, '').endsWith('/assets')
    ? rootFolder
    : `${rootFolder}/assets`;

  let prefix = '/image/upload';
  const lowerMime = (mimeType || '').toLowerCase();
  if (lowerMime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(path)) {
    prefix = '/video/upload';
  } else if (
    lowerMime.startsWith('raw/') ||
    /\.(doc|docx|xls|xlsx|zip|csv|txt)$/i.test(path)
  ) {
    prefix = '/raw/upload';
  } else if (lowerMime.includes('pdf') || /\.pdf$/i.test(path)) {
    prefix = '/image/upload';
  }

  let cleanPath = path.replace(/^https?:\/\/[^\/]+/i, '');

  if (cleanPath.includes('upload') || cleanPath.includes('assets') || cleanPath.includes('ips-') || /^\/v\d+\//i.test(cleanPath)) {
    const escapedRoot = rootPath ? rootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const rootRegex = new RegExp(`^\\/${escapedRoot}\\/`, 'i');

    cleanPath = cleanPath
      .replace(RE_UPLOAD_PREFIXES, '/')
      .replace(RE_TRANSFORMATIONS, '/')
      .replace(RE_VERSION, '/')
      .replace(rootRegex, '/')
      .replace(RE_LEGACY_IPS_ROOTS, '/')
      .replace(RE_CUSTOM_ASSETS, '/')
      .replace(RE_DOUBLE_ASSETS, '/')
      .replace(RE_SINGLE_ASSETS, '/');
  }

  cleanPath = cleanPath.replace(RE_DOUBLE_PDF, '.pdf');
  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  if (normalized.startsWith('/assets/')) {
    return normalized;
  }

  const envUrl = cfg?.get<string>('MEDIA_BASE_URL') || process.env.MEDIA_BASE_URL;
  if (envUrl && envUrl.trim() && !envUrl.includes('res.cloudinary.com')) {
    return `${envUrl.trim().replace(/\/+$/, '')}${normalized}`;
  }

  let optPrefix = prefix;
  if (prefix === '/image/upload' && !normalized.toLowerCase().endsWith('.pdf')) {
    optPrefix = '/image/upload/f_auto,q_auto';
  }

  return `${cloudBase}${optPrefix}/${rootPath}${normalized}`;
}

export const buildCloudinaryMediaUrl = toFullMediaUrl;

const MEDIA_FILE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|pdf|mp4|webm|mov|doc|docx|xls|xlsx|csv|zip)$/i;
const PAGE_ROUTE_PATTERNS = /^\/(about|academics|admissions|contact|news|gallery|press-release|facilities|careers|rules|privacy|terms|home|campus|fees|schedule|student|staff|parent|notice|#)/i;
const MEDIA_PROPERTY_KEYS = new Set([
  'fileUrl', 'avatar', 'avatarUrl', 'profileImageUrl', 'marksheetUrl',
  'imageUrl', 'photo', 'logo', 'banner', 'attachment', 'attachmentUrl',
  'resume', 'file', 'heroImage', 'thumbnail', 'coverImage', 'mediaUrl', 'icon', 'src',
]);
const LINK_PROPERTY_KEYS = new Set([
  'linkUrl', 'targetUrl', 'redirectUrl', 'href', 'url', 'actionUrl', 'externalUrl', 'destinationUrl',
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

    if (parentKey && LINK_PROPERTY_KEYS.has(parentKey)) {
      if (!trimmed.includes('res.cloudinary.com')) {
        return trimmed as unknown as T;
      }
    }

    if (PAGE_ROUTE_PATTERNS.test(trimmed) && !MEDIA_FILE_EXTENSIONS.test(trimmed)) {
      return trimmed as unknown as T;
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || (parentKey && MEDIA_PROPERTY_KEYS.has(parentKey)) || MEDIA_FILE_EXTENSIONS.test(trimmed)) {
      return toRelativeMediaPath(trimmed, configService) as unknown as T;
    }
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformMediaUrlsToRelative(item, configService, seen, depth + 1, parentKey)) as unknown as T;
  }

  if (typeof obj === 'object') {
    if (seen.has(obj as object)) return obj;
    if ((obj as any).constructor?.name && (obj as any).constructor.name !== 'Object' && (obj as any).constructor.name !== 'Array') return obj;
    seen.add(obj as object);

    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      transformed[key] = key === 'eventName' && typeof value === 'string'
        ? formatPrettyEventName(value)
        : transformMediaUrlsToRelative(value, configService, seen, depth + 1, key);
    }
    return transformed as unknown as T;
  }

  return obj;
}

/**
 * Recursively attach prefixes to relative media paths (for Response processing).
 */
export function transformMediaPathsToFull<T>(
  obj: T,
  configService?: ConfigService,
  seen = new WeakSet<object>(),
  depth = 0,
  parentKey?: string,
  parentMimeType?: string,
): T {
  if (obj === null || obj === undefined || depth > 15) return obj;

  if (typeof obj === 'string') {
    if (parentKey === 'eventName') return formatPrettyEventName(obj) as unknown as T;

    const trimmed = obj.trim();

    if (parentKey && LINK_PROPERTY_KEYS.has(parentKey)) {
      if (!trimmed.includes('res.cloudinary.com') && !trimmed.startsWith('/Settings/') && !trimmed.startsWith('/assets/Settings/')) {
        return trimmed as unknown as T;
      }
    }

    if (PAGE_ROUTE_PATTERNS.test(trimmed) && !MEDIA_FILE_EXTENSIONS.test(trimmed)) {
      return trimmed as unknown as T;
    }

    if (trimmed.startsWith('/')) {
      const rootFolder = getCloudinaryRootFolder(configService);
      const isMediaPrefix =
        (rootFolder && trimmed.startsWith(`/${rootFolder}`)) ||
        trimmed.startsWith('/assets') ||
        trimmed.startsWith('/Gallery') ||
        trimmed.startsWith('/Album') ||
        trimmed.startsWith('/Documents') ||
        trimmed.startsWith('/Settings') ||
        trimmed.startsWith('/Videos') ||
        trimmed.startsWith('/PressRelease') ||
        trimmed.startsWith('/Review') ||
        trimmed.startsWith('/Others') ||
        trimmed.startsWith('/others') ||
        trimmed.startsWith('/image/upload') ||
        trimmed.startsWith('/video/upload') ||
        trimmed.startsWith('/raw/upload') ||
        trimmed.startsWith('/uploads');

      if (isMediaPrefix || MEDIA_FILE_EXTENSIONS.test(trimmed) || (parentKey && MEDIA_PROPERTY_KEYS.has(parentKey))) {
        return toFullMediaUrl(trimmed, parentMimeType, configService) as unknown as T;
      }
    }
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformMediaPathsToFull(item, configService, seen, depth + 1, parentKey, parentMimeType)) as unknown as T;
  }

  if (typeof obj === 'object') {
    if (seen.has(obj as object)) return obj;
    if ((obj as any).constructor?.name && (obj as any).constructor.name !== 'Object' && (obj as any).constructor.name !== 'Array') return obj;
    seen.add(obj as object);

    const extractedMime = (obj as any).mimeType || (obj as any).mimetype || (obj as any).mime;

    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      transformed[key] = key === 'eventName' && typeof value === 'string'
        ? formatPrettyEventName(value)
        : transformMediaPathsToFull(value, configService, seen, depth + 1, key, extractedMime);
    }
    return transformed as unknown as T;
  }

  return obj;
}
