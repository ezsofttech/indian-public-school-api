import { ConfigService } from '@nestjs/config';

/**
 * Returns the base Cloudinary domain dynamically from configuration or environment.
 */
export function getCloudinaryCloudBaseUrl(configService?: ConfigService): string {
  const cloudName =
    configService?.get<string>('CLOUDINARY_CLOUD_NAME') ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    'niefrrkx';

  return `https://res.cloudinary.com/${cloudName.trim()}`;
}

/**
 * Returns the configured root folder dynamically from configuration or environment.
 */
export function getCloudinaryRootFolder(configService?: ConfigService): string {
  const envFolder =
    configService?.get<string>('CLOUDINARY_ROOT_FOLDER') ||
    process.env.CLOUDINARY_ROOT_FOLDER;

  return envFolder && envFolder.trim() ? envFolder.trim().replace(/^\/+|\/+$/g, '') : 'ips-education';
}

/**
 * Returns the base URL prefix for media assets dynamically.
 */
export function getMediaBaseUrl(configService?: ConfigService): string {
  const envUrl = configService?.get<string>('MEDIA_BASE_URL') || process.env.MEDIA_BASE_URL;
  if (envUrl && envUrl.trim() && !envUrl.includes('res.cloudinary.com')) return envUrl.trim().replace(/\/+$/, '');

  const cloudBase = getCloudinaryCloudBaseUrl(configService);
  const rootFolder = getCloudinaryRootFolder(configService);

  const rootPath = rootFolder.toLowerCase().replace(/\/+$/, '').endsWith('/assets')
    ? rootFolder
    : `${rootFolder}/assets`;

  return `${cloudBase}/${rootPath}`;
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
 * Strips host, upload prefix, and root folder from a URL to store a clean relative path in DB.
 */
export function toRelativeMediaPath(pathOrUrl: unknown, configService?: ConfigService): unknown {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) return pathOrUrl;

  let path = pathOrUrl.trim();
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const cloudBase = getCloudinaryCloudBaseUrl(configService);
    if (cloudBase && path.startsWith(cloudBase)) {
      path = path.slice(cloudBase.length);
    } else {
      const match = path.match(/^https?:\/\/res\.cloudinary\.com\/[^/]+(\/.*)$/i);
      if (match?.[1]) path = match[1];
    }
  }

  const rootFolder = getCloudinaryRootFolder(configService);
  const escapedRoot = rootFolder ? rootFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

  let clean = path.replace(/^\/(?:image|video|raw)\/upload\/(?:v\d+\/)?/i, '/');

  if (escapedRoot) {
    clean = clean.replace(new RegExp(`^\\/${escapedRoot}\\/`, 'i'), '/');
  }

  // Generic fallback replacement for root folder / assets
  clean = clean
    .replace(/^\/[a-zA-Z0-9_-]+\/assets\//i, '/')
    .replace(/^\/assets\//i, '/');

  return clean.startsWith('/') ? clean : `/${clean}`;
}

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
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (!path.includes('res.cloudinary.com')) return path;
    const cfg = typeof mimeTypeOrConfig === 'object' ? mimeTypeOrConfig : configService;
    const rootFolder = getCloudinaryRootFolder(cfg);
    if (rootFolder) {
      const escapedRoot = rootFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      path = path.replace(new RegExp(`\\/${escapedRoot}\\/upload\\/`, 'gi'), '/image/upload/');
    }
    return path;
  }

  const mimeType = typeof mimeTypeOrConfig === 'string' ? mimeTypeOrConfig : undefined;
  const cfg = typeof mimeTypeOrConfig === 'object' ? mimeTypeOrConfig : configService;

  const cloudBase = getCloudinaryCloudBaseUrl(cfg);
  const rootFolder = getCloudinaryRootFolder(cfg);
  const rootPath = rootFolder.toLowerCase().replace(/\/+$/, '').endsWith('/assets')
    ? rootFolder
    : `${rootFolder}/assets`;

  let prefix = '/image/upload';
  const lowerMime = (mimeType || '').toLowerCase();
  if (lowerMime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(path)) prefix = '/video/upload';
  else if (lowerMime.startsWith('raw/') || /\.(doc|docx|xls|xlsx|zip|csv)$/i.test(path)) prefix = '/raw/upload';

  const escapedRoot = rootPath ? rootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  let cleanPath = path.replace(/^\/(?:image|video|raw)\/upload\/(?:v\d+\/)?/i, '/');
  
  if (escapedRoot) {
    cleanPath = cleanPath.replace(new RegExp(`^\\/${escapedRoot}\\/`, 'i'), '/');
  }
  cleanPath = cleanPath
    .replace(/^\/[a-zA-Z0-9_-]+\/assets\//i, '/')
    .replace(/^\/assets\//i, '/');

  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  const envUrl = cfg?.get<string>('MEDIA_BASE_URL') || process.env.MEDIA_BASE_URL;
  if (envUrl && envUrl.trim() && !envUrl.includes('res.cloudinary.com')) {
    return `${envUrl.trim().replace(/\/+$/, '')}${normalized}`;
  }

  return `${cloudBase}${prefix}/${rootPath}${normalized}`;
}

export const buildCloudinaryMediaUrl = toFullMediaUrl;

const MEDIA_FILE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|pdf|mp4|webm|mov|doc|docx|xls|xlsx|csv|zip)$/i;
const MEDIA_PROPERTY_KEYS = new Set([
  'fileUrl', 'url', 'avatar', 'avatarUrl', 'profileImageUrl', 'marksheetUrl',
  'imageUrl', 'photo', 'logo', 'banner', 'attachment', 'attachmentUrl',
  'resume', 'file', 'heroImage', 'thumbnail', 'coverImage', 'mediaUrl', 'icon', 'src', 'path',
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
