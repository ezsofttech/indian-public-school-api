import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  YouTubeChannelInfo,
  YouTubeVideoItem,
  YouTubeVideosResponse,
  YouTubePlaylistItem,
} from './interfaces/youtube.interface';
import { YouTubeQueryDto } from './dto/youtube-query.dto';

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);

  // In-memory caching layer
  private inMemoryCache = new Map<string, { data: any; expiresAt: number }>();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(CACHE_MANAGER)
    private readonly cacheManager?: Cache,
  ) { }

  private get channelHandle(): string {
    return (
      this.configService.get<string>('YOUTUBE_CHANNEL_HANDLE')?.trim() ||
      process.env.YOUTUBE_CHANNEL_HANDLE?.trim() ||
      ''
    );
  }

  private get channelId(): string {
    return (
      this.configService.get<string>('YOUTUBE_CHANNEL_ID')?.trim() ||
      process.env.YOUTUBE_CHANNEL_ID?.trim() ||
      ''
    );
  }

  private get apiKey(): string | undefined {
    return (
      this.configService.get<string>('YOUTUBE_API_KEY')?.trim() ||
      process.env.YOUTUBE_API_KEY?.trim() ||
      undefined
    );
  }

  // ---------------- Cache Helper ----------------
  private async getCached<T>(key: string): Promise<T | null> {
    try {
      if (this.cacheManager) {
        const val = await this.cacheManager.get<T>(key);
        if (val) return val;
      }
    } catch {
      // ignore
    }

    const mem = this.inMemoryCache.get(key);
    if (mem && mem.expiresAt > Date.now()) {
      return mem.data as T;
    }
    return null;
  }

  private async setCached(key: string, data: any, ttlSeconds = 1800): Promise<void> {
    try {
      if (this.cacheManager) {
        await this.cacheManager.set(key, data, ttlSeconds * 1000);
      }
    } catch {
      // ignore
    }

    this.inMemoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  // ---------------- XML & RSS Helpers ----------------
  public decodeXmlEntities(text: string): string {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  private pickTag(block: string, tag: string): string {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return match?.[1] ? this.decodeXmlEntities(match[1].trim()) : '';
  }

  private pickAttr(block: string, tag: string, attr: string): string {
    const match = block.match(
      new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*\\/?>`),
    );
    return match?.[1] ?? '';
  }

  public parseRssEntries(xml: string): YouTubeVideoItem[] {
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    const results: YouTubeVideoItem[] = [];

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const id =
        this.pickTag(entry, 'yt:videoId') ||
        this.pickTag(entry, 'id').replace(/^yt:video:/, '');
      if (!id) continue;

      const rawTitle = this.pickTag(entry, 'title');
      const title = this.decodeXmlEntities(rawTitle || 'Video');
      const rawDesc =
        this.pickTag(entry, 'media:description') || this.pickTag(entry, 'summary');
      const description = this.decodeXmlEntities(rawDesc);
      const publishedAt = this.pickTag(entry, 'published') || new Date().toISOString();
      const thumbnail =
        this.pickAttr(entry, 'media:thumbnail', 'url') ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const authorTitle =
        this.pickTag(entry, 'name') || this.pickTag(xml, 'title') || this.channelHandle || '';

      results.push({
        id,
        title,
        eventName: title,
        description,
        src: `https://www.youtube.com/watch?v=${id}`,
        url: `https://www.youtube.com/watch?v=${id}`,
        fileUrl: [`https://www.youtube.com/watch?v=${id}`],
        embedUrl: `https://www.youtube.com/embed/${id}`,
        poster: thumbnail,
        posterUrl: thumbnail,
        thumbnail,
        category: this.categorizeVideo(title, description),
        directory: '/album/videos',
        date: publishedAt,
        publishedAt,
        duration: '1:00',
        views: '100+',
        channelTitle: authorTitle,
        channelId: this.channelId,
        source: 'youtube',
        isYouTube: true,
        isFeatured: idx === 0,
      });
    }

    return results;
  }

  public async fetchFromRss(channelId: string, limit = 50): Promise<YouTubeVideoItem[]> {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      if (!res.ok) return [];
      const xml = await res.text();
      return this.parseRssEntries(xml).slice(0, limit);
    } catch {
      return [];
    }
  }

  public async resolveChannelIdFromHandle(handle: string): Promise<string | null> {
    const cleanHandle = handle.replace(/^@/, '').trim();
    if (!cleanHandle) return null;

    try {
      const res = await fetch(`https://www.youtube.com/@${cleanHandle}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const external = html.match(/"externalId":"(UC[^"]+)"/)?.[1];
      const channel = html.match(/"channelId":"(UC[^"]+)"/)?.[1];
      return external || channel || null;
    } catch {
      return null;
    }
  }

  // ---------------- Category Classifier ----------------
  private categorizeVideo(title = '', description = ''): string {
    const combined = `${title} ${description}`.toLowerCase();

    if (
      /navratri|nuakhai|independence|republic|diwali|annual|celebrat|puja|christmas|ceremony|festiv|function|farewell|welcome|investiture|gandhi|janmashtami|holi|durga/i.test(
        combined,
      )
    ) {
      return 'Events & Celebrations';
    }

    if (
      /campus|tour|building|infrastructure|smart class|classroom|facility|view|library|drone|panoramic|glimpse/i.test(
        combined,
      )
    ) {
      return 'Campus & Tour';
    }

    if (
      /sport|cricket|football|karate|athletic|taekwondo|yoga|dance|music|singing|art|craft|drawing|drawing|tournament|match|championship/i.test(
        combined,
      )
    ) {
      return 'Sports & Activities';
    }

    if (
      /academ|science|exhibition|olympiad|workshop|learning|class|lecture|quiz|result|topper|exam|study|project|robotics/i.test(
        combined,
      )
    ) {
      return 'Academics & Learning';
    }

    if (/hostel|mess|dining|boarding|dormitory|student life/i.test(combined)) {
      return 'Hostel & Student Life';
    }

    return 'Events & Celebrations';
  }

  // ---------------- Format Duration ----------------
  private formatDuration(isoDuration?: string): string {
    if (!isoDuration) return '1:00';
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '1:00';

    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseInt(match[3], 10) : 0;

    const secStr = seconds.toString().padStart(2, '0');

    if (hours > 0) {
      const minStr = minutes.toString().padStart(2, '0');
      return `${hours}:${minStr}:${secStr}`;
    }

    return `${minutes}:${secStr}`;
  }

  // ---------------- Channel Info ----------------
  async getChannelInfo(): Promise<YouTubeChannelInfo> {
    const channelId = this.channelId;
    const channelHandle = this.channelHandle;
    const cacheKey = `yt_channel_${channelId || channelHandle}`;
    const cached = await this.getCached<YouTubeChannelInfo>(cacheKey);
    if (cached && cached.videoCount !== '0') return cached;

    // 1. Try YouTube Data API v3 if API key exists
    if (this.apiKey && channelId) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics,brandingSettings&id=${channelId}&key=${this.apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const item = json.items?.[0];
          if (item) {
            const snippet = item.snippet || {};
            const stats = item.statistics || {};
            const thumb =
              snippet.thumbnails?.high?.url ||
              snippet.thumbnails?.medium?.url ||
              snippet.thumbnails?.default?.url ||
              '';

            const channelInfo: YouTubeChannelInfo = {
              channelId: item.id || channelId,
              handle: snippet.customUrl || channelHandle,
              title: (snippet.title || channelHandle || '').trim(),
              description: snippet.description || '',
              customUrl: snippet.customUrl || channelHandle,
              url: `https://www.youtube.com/${snippet.customUrl || channelHandle}`,
              avatarUrl: thumb,
              subscriberCount: stats.subscriberCount || '0',
              videoCount: stats.videoCount || '0',
              viewCount: stats.viewCount || '0',
              publishedAt: snippet.publishedAt || new Date().toISOString(),
            };

            await this.setCached(cacheKey, channelInfo, 3600); // 1 hour
            return channelInfo;
          }
        } else {
          this.logger.warn(`YouTube Channel API returned status ${res.status}`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch channel from YouTube API: ${err.message}`);
      }
    }

    // 2. Fallback: Parse live channel header from YouTube Channel HTML (0 quota, no API key needed)
    try {
      const channelUrl = `https://www.youtube.com/${channelHandle || '@ipssbp'}/videos`;
      const res = await fetch(channelUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (res.ok) {
        const html = await res.text();
        const initialDataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
        if (initialDataMatch && initialDataMatch[1]) {
          const ytData = JSON.parse(initialDataMatch[1]);
          const header = ytData.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
          const metaRows = header?.metadata?.contentMetadataViewModel?.metadataRows || [];
          const secondRowParts = metaRows[1]?.metadataParts || [];

          const title = header?.title?.dynamicTextViewModel?.text?.content || channelHandle || '';
          const subText = secondRowParts[0]?.text?.content || secondRowParts[0]?.accessibilityLabel || '0';
          const videoText = secondRowParts[1]?.text?.content || '0';
          const avatarUrl =
            header?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources?.slice(-1)[0]?.url || '';

          const channelInfo: YouTubeChannelInfo = {
            channelId,
            handle: channelHandle,
            title: title.trim(),
            description: '',
            customUrl: channelHandle,
            url: `https://www.youtube.com/${channelHandle}`,
            avatarUrl,
            subscriberCount: subText.replace(/subscribers?/i, '').trim(),
            videoCount: videoText.replace(/videos?/i, '').trim(),
            viewCount: '100K+',
            publishedAt: new Date().toISOString(),
          };

          await this.setCached(cacheKey, channelInfo, 3600);
          return channelInfo;
        }
      }
    } catch (scrapeErr: any) {
      this.logger.warn(`Failed scraping channel info: ${scrapeErr.message}`);
    }

    const fallbackInfo: YouTubeChannelInfo = {
      channelId,
      handle: channelHandle,
      title: channelHandle || '',
      description: '',
      customUrl: channelHandle,
      url: channelHandle
        ? `https://www.youtube.com/${channelHandle.startsWith('@') ? channelHandle : '@' + channelHandle}`
        : '',
      avatarUrl: '',
      subscriberCount: '0',
      videoCount: '0',
      viewCount: '0',
      publishedAt: new Date().toISOString(),
    };
    return fallbackInfo;
  }

  // ---------------- Innertube Uploads Playlist Fetcher ----------------
  private async fetchFromInnertube(playlistId: string): Promise<YouTubeVideoItem[]> {
    try {
      const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
      const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231219.01.00' } },
          browseId,
        }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
      const contents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const rawItems = contents[0]?.itemSectionRenderer?.contents || [];

      const results: YouTubeVideoItem[] = [];

      for (let idx = 0; idx < rawItems.length; idx++) {
        const it = rawItems[idx];
        const lockup = it.lockupViewModel;
        const pvr = it.playlistVideoRenderer;

        if (lockup && lockup.contentId) {
          const vidId = lockup.contentId;
          const title = this.decodeXmlEntities(
            (lockup.metadata?.lockupMetadataViewModel?.title?.content || `Video ${idx + 1}`).trim(),
          );
          const parts =
            lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
              ?.metadataRows?.[0]?.metadataParts || [];
          const views = parts[0]?.accessibilityLabel || parts[0]?.text?.content || '100+ views';
          const dateStr = parts[1]?.text?.content || new Date().toISOString();
          const thumb = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
          const category = this.categorizeVideo(title, '');

          results.push({
            id: vidId,
            title,
            eventName: title,
            description: '',
            src: `https://www.youtube.com/watch?v=${vidId}`,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            fileUrl: [`https://www.youtube.com/watch?v=${vidId}`],
            embedUrl: `https://www.youtube.com/embed/${vidId}`,
            poster: thumb,
            posterUrl: thumb,
            thumbnail: thumb,
            category,
            directory: '/album/videos',
            date: dateStr,
            publishedAt: dateStr,
            duration: '1:15',
            views,
            channelTitle: this.channelHandle || '',
            channelId: this.channelId,
            source: 'youtube',
            isYouTube: true,
            isFeatured: idx === 0,
          });
        } else if (pvr && pvr.videoId) {
          const vidId = pvr.videoId;
          const title = this.decodeXmlEntities(
            (pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || `Video ${idx + 1}`).trim(),
          );
          const views = pvr.videoInfo?.runs?.[0]?.text || '100+ views';
          const thumb =
            pvr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
          const category = this.categorizeVideo(title, '');

          results.push({
            id: vidId,
            title,
            eventName: title,
            description: '',
            src: `https://www.youtube.com/watch?v=${vidId}`,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            fileUrl: [`https://www.youtube.com/watch?v=${vidId}`],
            embedUrl: `https://www.youtube.com/embed/${vidId}`,
            poster: thumb,
            posterUrl: thumb,
            thumbnail: thumb,
            category,
            directory: '/album/videos',
            date: new Date().toISOString(),
            publishedAt: new Date().toISOString(),
            duration: pvr.lengthSeconds
              ? `${Math.floor(pvr.lengthSeconds / 60)}:${(pvr.lengthSeconds % 60).toString().padStart(2, '0')}`
              : '1:15',
            views,
            channelTitle: this.channelHandle || '',
            channelId: this.channelId,
            source: 'youtube',
            isYouTube: true,
            isFeatured: idx === 0,
          });
        }
      }

      return results;
    } catch (err: any) {
      this.logger.warn(`Innertube browse failed: ${err.message}`);
      return [];
    }
  }

  // ---------------- Fetch All Channel Videos (Cached) ----------------
  private async fetchAllChannelVideos(): Promise<YouTubeVideoItem[]> {
    const cacheKey = `yt_videos_${this.channelId}`;
    const cached = await this.getCached<YouTubeVideoItem[]>(cacheKey);
    // Don't treat stale RSS-capped (<= 15) results as valid full-channel cache
    if (cached && cached.length > 15) return cached;

    const uploadsPlaylistId = this.channelId.startsWith('UC')
      ? 'UU' + this.channelId.substring(2)
      : `UU${this.channelId}`;

    let videoItems: YouTubeVideoItem[] = [];

    // 1. Try YouTube Data API v3 via Playlist Items (uploads playlist)
    if (this.apiKey && this.channelId) {
      try {
        const rawPlaylistItems: any[] = [];
        let nextPageToken: string | undefined = undefined;
        let pageCount = 0;

        do {
          const pageTokenParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
          const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50${pageTokenParam}&key=${this.apiKey}`;
          const pRes = await fetch(playlistUrl);
          if (!pRes.ok) break;

          const pJson = await pRes.json();
          if (Array.isArray(pJson.items)) {
            rawPlaylistItems.push(...pJson.items);
          }
          nextPageToken = pJson.nextPageToken;
          pageCount++;
        } while (nextPageToken && pageCount < 10);

        if (rawPlaylistItems.length > 0) {
          const videoIds = rawPlaylistItems
            .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
            .filter(Boolean);

          const detailsMap = new Map<string, { duration: string; views: string; likes: string }>();

          for (let i = 0; i < videoIds.length; i += 50) {
            const chunk = videoIds.slice(i, i + 50);
            try {
              const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${chunk.join(',')}&key=${this.apiKey}`;
              const vRes = await fetch(vUrl);
              if (vRes.ok) {
                const vJson = await vRes.json();
                if (Array.isArray(vJson.items)) {
                  for (const v of vJson.items) {
                    detailsMap.set(v.id, {
                      duration: this.formatDuration(v.contentDetails?.duration),
                      views: v.statistics?.viewCount || '0',
                      likes: v.statistics?.likeCount || '0',
                    });
                  }
                }
              }
            } catch {
              // ignore
            }
          }

          videoItems = rawPlaylistItems.map((item, idx) => {
            const vidId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
            const snippet = item.snippet || {};
            const details = detailsMap.get(vidId);
            const thumb =
              snippet.thumbnails?.maxres?.url ||
              snippet.thumbnails?.standard?.url ||
              snippet.thumbnails?.high?.url ||
              snippet.thumbnails?.medium?.url ||
              snippet.thumbnails?.default?.url ||
              `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

            const title = this.decodeXmlEntities((snippet.title || `Video ${idx + 1}`).trim());
            const desc = this.decodeXmlEntities(snippet.description || '');
            const category = this.categorizeVideo(title, desc);

            return {
              id: vidId,
              title,
              eventName: title,
              description: desc,
              src: `https://www.youtube.com/watch?v=${vidId}`,
              url: `https://www.youtube.com/watch?v=${vidId}`,
              fileUrl: [`https://www.youtube.com/watch?v=${vidId}`],
              embedUrl: `https://www.youtube.com/embed/${vidId}`,
              poster: thumb,
              posterUrl: thumb,
              thumbnail: thumb,
              thumbnails: {
                default: snippet.thumbnails?.default?.url,
                medium: snippet.thumbnails?.medium?.url,
                high: snippet.thumbnails?.high?.url,
                standard: snippet.thumbnails?.standard?.url,
                maxres: snippet.thumbnails?.maxres?.url,
              },
              category,
              directory: '/album/videos',
              date: item.contentDetails?.videoPublishedAt || snippet.publishedAt || new Date().toISOString(),
              publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || new Date().toISOString(),
              duration: details?.duration || '1:15',
              views: details?.views || '100+',
              likeCount: details?.likes,
              channelTitle: snippet.channelTitle || this.channelHandle || '',
              channelId: snippet.channelId || this.channelId,
              source: 'youtube' as const,
              isYouTube: true as const,
              isFeatured: idx === 0,
            };
          });

          if (videoItems.length > 0) {
            await this.setCached(cacheKey, videoItems, 1800); // 30 minutes cache
            return videoItems;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch videos using YouTube Data API: ${err.message}`);
      }
    }

    // 2. Try Innertube Uploads Playlist (Fetches all 87+ videos directly without API key)
    try {
      const innertubeItems = await this.fetchFromInnertube(uploadsPlaylistId);
      if (innertubeItems.length > 0) {
        await this.setCached(cacheKey, innertubeItems, 1800);
        return innertubeItems;
      }
    } catch (innertubeErr: any) {
      this.logger.warn(`Failed to fetch videos via Innertube: ${innertubeErr.message}`);
    }

    // 3. Fallback: Parse ytInitialData from YouTube Channel HTML (Supports lockupViewModel & videoRenderer)
    try {
      const channelUrl = `https://www.youtube.com/${this.channelHandle}/videos`;
      const res = await fetch(channelUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (res.ok) {
        const html = await res.text();
        const initialDataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
        if (initialDataMatch && initialDataMatch[1]) {
          const ytData = JSON.parse(initialDataMatch[1]);
          const tabs =
            ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
          const videosTab = tabs.find(
            (t: any) =>
              t.tabRenderer?.content?.richGridRenderer ||
              t.tabRenderer?.content?.sectionListRenderer,
          );

          const contents =
            videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

          const scrapedItems: YouTubeVideoItem[] = [];

          for (const c of contents) {
            const lockup = c.richItemRenderer?.content?.lockupViewModel;
            const vRenderer = c.richItemRenderer?.content?.videoRenderer;

            if (lockup && lockup.contentId) {
              const vidId = lockup.contentId;
              const title = this.decodeXmlEntities(
                (lockup.metadata?.lockupMetadataViewModel?.title?.content || 'Video').trim(),
              );
              const parts =
                lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
                  ?.metadataRows?.[0]?.metadataParts || [];
              const views = parts[0]?.accessibilityLabel || parts[0]?.text?.content || '100+ views';
              const dateStr = parts[1]?.text?.content || new Date().toISOString();
              const thumb = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

              scrapedItems.push({
                id: vidId,
                title,
                eventName: title,
                description: '',
                src: `https://www.youtube.com/watch?v=${vidId}`,
                url: `https://www.youtube.com/watch?v=${vidId}`,
                fileUrl: [`https://www.youtube.com/watch?v=${vidId}`],
                embedUrl: `https://www.youtube.com/embed/${vidId}`,
                poster: thumb,
                posterUrl: thumb,
                thumbnail: thumb,
                category: this.categorizeVideo(title, ''),
                directory: '/album/videos',
                date: dateStr,
                publishedAt: dateStr,
                duration: '1:15',
                views,
                channelTitle: this.channelHandle || '',
                channelId: this.channelId,
                source: 'youtube',
                isYouTube: true,
                isFeatured: scrapedItems.length === 0,
              });
            } else if (vRenderer && vRenderer.videoId) {
              const vidId = vRenderer.videoId;
              const title = this.decodeXmlEntities(
                (vRenderer.title?.runs?.[0]?.text || vRenderer.title?.simpleText || 'Video').trim(),
              );
              const duration =
                vRenderer.lengthText?.simpleText ||
                vRenderer.lengthText?.runs?.[0]?.text ||
                '1:00';
              const viewCountText =
                vRenderer.viewCountText?.simpleText ||
                vRenderer.viewCountText?.runs?.[0]?.text ||
                '100+ views';
              const publishedText =
                vRenderer.publishedTimeText?.simpleText ||
                new Date().toISOString();
              const thumb =
                vRenderer.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
              const desc =
                vRenderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '';

              scrapedItems.push({
                id: vidId,
                title,
                eventName: title,
                description: desc,
                src: `https://www.youtube.com/watch?v=${vidId}`,
                url: `https://www.youtube.com/watch?v=${vidId}`,
                fileUrl: [`https://www.youtube.com/watch?v=${vidId}`],
                embedUrl: `https://www.youtube.com/embed/${vidId}`,
                poster: thumb,
                posterUrl: thumb,
                thumbnail: thumb,
                category: this.categorizeVideo(title, desc),
                directory: '/album/videos',
                date: publishedText,
                publishedAt: publishedText,
                duration,
                views: viewCountText,
                channelTitle: vRenderer.ownerText?.runs?.[0]?.text || this.channelHandle || '',
                channelId: this.channelId,
                source: 'youtube',
                isYouTube: true,
                isFeatured: scrapedItems.length === 0,
              });
            }
          }

          if (scrapedItems.length > 0) {
            await this.setCached(cacheKey, scrapedItems, 1800);
            return scrapedItems;
          }
        }
      }
    } catch (scrapedErr: any) {
      this.logger.warn(`Failed fallback channel scraping: ${scrapedErr.message}`);
    }

    // 4. Last Resort Fallback: RSS XML Feed (Google caps this to latest 15 videos)
    try {
      const rssItems = await this.fetchFromRss(this.channelId, 100);
      if (rssItems.length > 0) {
        await this.setCached(cacheKey, rssItems, 1800);
        return rssItems;
      }
    } catch {
      // ignore
    }

    return [];
  }

  // ---------------- Public Query API ----------------
  async getVideos(query: YouTubeQueryDto = {}): Promise<YouTubeVideosResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));
    const category = query.category?.trim();
    const search = query.search?.trim()?.toLowerCase();
    const sortBy = query.sortBy || 'newest';

    const [allVideos, channel] = await Promise.all([
      this.fetchAllChannelVideos(),
      this.getChannelInfo(),
    ]);

    let filtered = [...allVideos];

    // Filter by Category
    if (category && category !== 'All') {
      filtered = filtered.filter(
        (v) => v.category.toLowerCase() === category.toLowerCase(),
      );
    }

    // Filter by Search Query
    if (search) {
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(search) ||
          v.description.toLowerCase().includes(search),
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'popular') {
        const viewsA = parseInt(String(a.views).replace(/\D/g, ''), 10) || 0;
        const viewsB = parseInt(String(b.views).replace(/\D/g, ''), 10) || 0;
        return viewsB - viewsA;
      }
      // 'newest' default
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      channel,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  // ---------------- Single Video by ID ----------------
  async getVideoById(id: string): Promise<YouTubeVideoItem | null> {
    const cleanId = id.replace(/^yt-/, '').trim();
    const allVideos = await this.fetchAllChannelVideos();
    const found = allVideos.find((v) => v.id === cleanId);
    if (found) return found;

    if (this.apiKey) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${cleanId}&key=${this.apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const item = json.items?.[0];
          if (item) {
            const snippet = item.snippet || {};
            const thumb =
              snippet.thumbnails?.maxres?.url ||
              snippet.thumbnails?.high?.url ||
              `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;
            const title = (snippet.title || 'Video').trim();
            const desc = snippet.description || '';

            return {
              id: cleanId,
              title,
              eventName: title,
              description: desc,
              src: `https://www.youtube.com/watch?v=${cleanId}`,
              url: `https://www.youtube.com/watch?v=${cleanId}`,
              fileUrl: [`https://www.youtube.com/watch?v=${cleanId}`],
              embedUrl: `https://www.youtube.com/embed/${cleanId}`,
              poster: thumb,
              posterUrl: thumb,
              thumbnail: thumb,
              category: this.categorizeVideo(title, desc),
              directory: '/album/videos',
              date: snippet.publishedAt || new Date().toISOString(),
              publishedAt: snippet.publishedAt || new Date().toISOString(),
              duration: this.formatDuration(item.contentDetails?.duration),
              views: item.statistics?.viewCount || '100+',
              likeCount: item.statistics?.likeCount,
              channelTitle: snippet.channelTitle || this.channelHandle || '',
              channelId: snippet.channelId || this.channelId,
              source: 'youtube',
              isYouTube: true,
              isFeatured: false,
            };
          }
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  // ---------------- Channel Playlists ----------------
  async getPlaylists(): Promise<YouTubePlaylistItem[]> {
    const cacheKey = `yt_playlists_${this.channelId}`;
    const cached = await this.getCached<YouTubePlaylistItem[]>(cacheKey);
    if (cached) return cached;

    if (this.apiKey && this.channelId) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&channelId=${this.channelId}&maxResults=25&key=${this.apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.items)) {
            const playlists: YouTubePlaylistItem[] = json.items.map((item: any) => ({
              id: item.id,
              title: item.snippet?.title || 'Playlist',
              description: item.snippet?.description || '',
              thumbnail:
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.default?.url ||
                '',
              itemCount: item.contentDetails?.itemCount || 0,
              url: `https://www.youtube.com/playlist?list=${item.id}`,
              embedUrl: `https://www.youtube.com/embed/videoseries?list=${item.id}`,
            }));

            await this.setCached(cacheKey, playlists, 3600);
            return playlists;
          }
        }
      } catch {
        // ignore
      }
    }

    return [];
  }
}
