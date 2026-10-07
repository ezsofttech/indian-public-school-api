/**
 * Extract Cloudinary public ID from a Cloudinary URL string.
 * Examples:
 * https://res.cloudinary.com/demo/image/upload/v1234567890/folder/sample.jpg -> folder/sample
 * https://res.cloudinary.com/demo/image/upload/sample.png -> sample
 */
export function extractCloudinaryPublicId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const decodedUrl = decodeURIComponent(url);

  // If it's a full Cloudinary URL with /upload/
  const match = decodedUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (match && match[1]) {
    return match[1];
  }

  // If it's already a Cloudinary public ID or key without http(s)://
  if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
    const cleanPath = decodedUrl.replace(/^\/+/, '');
    // Remove extension if present, but keep folder hierarchy
    return cleanPath.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  // Fallback: extract last filename part if full URL couldn't match /upload/
  const parts = decodedUrl.split('/');
  const filename = parts[parts.length - 1];
  if (filename) {
    return filename.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  return null;
}

/**
 * Format raw byte numbers strictly into MB format.
 * Examples:
 * 10485760 -> "10 MB"
 * 69974235 -> "66.73 MB"
 * 524288 -> "0.5 MB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';

  const mb = bytes / (1024 * 1024);
  const dm = decimals < 0 ? 0 : decimals;
  const num = parseFloat(mb.toFixed(dm));

  return `${num} MB`;
}

/**
 * Format file size error messages from Cloudinary or storage providers into human-readable MB units,
 * preserving the raw server byte count inside brackets.
 *
 * Example input:  "File size too large. Got 69974235. Maximum is 10485760."
 * Example output: "File size too large. Got 66.73 MB (69,974,235 bytes). Maximum is 10 MB (10,485,760 bytes)."
 */
export function formatFileSizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') return message;

  // Prevent double formatting if message was already processed
  if (message.includes('MB (') || message.includes('bytes)')) {
    return message;
  }

  // Single-pass replacement targeting raw byte counts (4+ digits) after keywords
  return message.replace(
    /\b(Got|Maximum is|max_file_size\s*:?|exceeds)\s*(\d{4,})\b(\s*bytes)?/gi,
    (match, keyword, rawBytes) => {
      const bytesNum = parseInt(rawBytes, 10);
      if (isNaN(bytesNum)) return match;

      const formattedMb = formatBytes(bytesNum);
      const commaBytes = bytesNum.toLocaleString('en-US');
      return `${keyword} ${formattedMb} (${commaBytes} bytes)`;
    },
  );
}
