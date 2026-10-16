import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface StagedFileEntry {
  url: string;
  storageKey?: string;
  sessionId?: string;
  uploadedAt: number;
  timeoutId: NodeJS.Timeout;
}

export const CLOUDINARY_FALLBACK_EVENTS = {
  FILE_STAGED: 'cloudinary.file.staged',
  FILE_COMMITTED: 'cloudinary.file.committed',
  FILE_ORPHANED: 'cloudinary.file.orphaned',
  FILE_ABORTED: 'cloudinary.file.aborted',
} as const;

/**
 * Event-based fallback utility for managing Cloudinary asset lifecycles.
 * Automatically purges orphaned files if the user does not save the record with the uploaded file.
 */
export class CloudinaryRecordFallback {
  private static readonly logger = new Logger(CloudinaryRecordFallback.name);
  private static readonly stagedFiles = new Map<string, StagedFileEntry>();
  private static readonly DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes grace period

  /**
   * Track an uploaded file with an event-based fallback timer.
   * If the record is not committed before timeout, emits 'cloudinary.file.orphaned' and triggers cleanup.
   */
  static track(
    url: string,
    options?: {
      sessionId?: string;
      storageKey?: string;
      timeoutMs?: number;
      eventEmitter?: EventEmitter2;
      deleteHandler?: (url: string) => Promise<boolean>;
    },
  ): void {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();

    // Clear existing timer if URL was re-staged
    this.clearEntry(cleanUrl);

    const timeoutMs = options?.timeoutMs || this.DEFAULT_TIMEOUT_MS;

    const timeoutId = setTimeout(async () => {
      this.logger.warn(
        `Orphaned Cloudinary file detected: "${cleanUrl}". Record was not saved. Triggering event fallback cleanup...`,
      );
      this.stagedFiles.delete(cleanUrl);

      // 1. Emit event
      if (options?.eventEmitter) {
        options.eventEmitter.emit(CLOUDINARY_FALLBACK_EVENTS.FILE_ORPHANED, {
          url: cleanUrl,
          sessionId: options.sessionId,
        });
      }

      // 2. Perform fallback deletion
      if (options?.deleteHandler) {
        try {
          await options.deleteHandler(cleanUrl);
          this.logger.log(`Successfully purged orphaned Cloudinary asset: ${cleanUrl}`);
        } catch (err: any) {
          this.logger.error(
            `Fallback cleanup failed for orphaned asset ${cleanUrl}: ${err?.message || err}`,
          );
        }
      }
    }, timeoutMs);

    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    this.stagedFiles.set(cleanUrl, {
      url: cleanUrl,
      storageKey: options?.storageKey,
      sessionId: options?.sessionId,
      uploadedAt: Date.now(),
      timeoutId,
    });

    if (options?.eventEmitter) {
      options.eventEmitter.emit(CLOUDINARY_FALLBACK_EVENTS.FILE_STAGED, {
        url: cleanUrl,
        sessionId: options?.sessionId,
      });
    }
  }

  /**
   * Commit one or multiple URLs. Clears fallback timers so files are kept permanently.
   */
  static commit(urls: string | string[], eventEmitter?: EventEmitter2): void {
    const list = Array.isArray(urls) ? urls : [urls];
    for (const rawUrl of list) {
      if (!rawUrl || typeof rawUrl !== 'string') continue;
      const cleanUrl = rawUrl.trim();
      this.clearEntry(cleanUrl);
    }

    if (eventEmitter && list.length > 0) {
      eventEmitter.emit(CLOUDINARY_FALLBACK_EVENTS.FILE_COMMITTED, { urls: list });
    }
  }

  /**
   * Abort and immediately clean up staged files for a given session, URL, or URL list.
   */
  static async abort(
    target: { url?: string; sessionId?: string; urls?: string[] },
    deleteHandler: (url: string) => Promise<boolean>,
    eventEmitter?: EventEmitter2,
    throwOnError?: boolean,
  ): Promise<string[]> {
    const urlsToDelete = new Set<string>();

    if (target.urls && Array.isArray(target.urls)) {
      target.urls.forEach((u) => u && urlsToDelete.add(u.trim()));
    }
    if (target.url) {
      urlsToDelete.add(target.url.trim());
    }
    if (target.sessionId) {
      for (const [url, entry] of this.stagedFiles.entries()) {
        if (entry.sessionId === target.sessionId) {
          urlsToDelete.add(url);
        }
      }
    }

    const deleted: string[] = [];
    for (const url of urlsToDelete) {
      this.clearEntry(url);
      try {
        await deleteHandler(url);
        deleted.push(url);
      } catch (err: any) {
        this.logger.error(`Failed to clean up aborted staged file ${url}: ${err?.message || err}`);
        if (throwOnError) {
          throw err;
        }
      }
    }

    if (eventEmitter && deleted.length > 0) {
      eventEmitter.emit(CLOUDINARY_FALLBACK_EVENTS.FILE_ABORTED, {
        urls: deleted,
        sessionId: target.sessionId,
      });
    }

    return deleted;
  }

  /**
   * Retrieve all currently staged URLs associated with a session ID.
   */
  static getStagedUrlsForSession(sessionId: string): string[] {
    const urls: string[] = [];
    for (const [url, entry] of this.stagedFiles.entries()) {
      if (entry.sessionId === sessionId) {
        urls.push(url);
      }
    }
    return urls;
  }

  /**
   * Check if a URL is currently staged.
   */
  static isStaged(url: string): boolean {
    return this.stagedFiles.has(url.trim());
  }

  /**
   * Clear timer and purge from internal staged files map.
   */
  private static clearEntry(url: string): void {
    const existing = this.stagedFiles.get(url);
    if (existing) {
      clearTimeout(existing.timeoutId);
      this.stagedFiles.delete(url);
    }
  }

  /**
   * Reset all tracked entries (useful for testing).
   */
  static reset(): void {
    for (const entry of this.stagedFiles.values()) {
      clearTimeout(entry.timeoutId);
    }
    this.stagedFiles.clear();
  }
}
