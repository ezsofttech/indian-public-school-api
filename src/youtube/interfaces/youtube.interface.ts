export interface YouTubeChannelInfo {
  channelId: string;
  handle: string;
  title: string;
  description: string;
  customUrl: string;
  url: string;
  avatarUrl: string;
  bannerUrl?: string;
  subscriberCount?: number | string;
  videoCount?: number | string;
  viewCount?: number | string;
  publishedAt?: string;
}

export interface YouTubeVideoItem {
  id: string;
  title: string;
  eventName: string;
  description: string;
  src: string;
  url: string;
  fileUrl: string[];
  embedUrl: string;
  poster: string;
  posterUrl: string;
  thumbnail: string;
  thumbnails?: {
    default?: string;
    medium?: string;
    high?: string;
    standard?: string;
    maxres?: string;
  };
  category: string;
  directory: string;
  date: string;
  publishedAt: string;
  duration?: string;
  views?: number | string;
  likeCount?: number | string;
  channelTitle: string;
  channelId: string;
  source: 'youtube';
  isYouTube: true;
  isFeatured: boolean;
}

export interface YouTubeVideosResponse {
  items: YouTubeVideoItem[];
  channel: YouTubeChannelInfo;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPageToken?: string;
  prevPageToken?: string;
}

export interface YouTubePlaylistItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  itemCount: number;
  url: string;
  embedUrl: string;
}
