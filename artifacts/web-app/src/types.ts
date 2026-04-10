export type MediaTag = string;
export type PoolSort = "latest" | "oldest" | "name";

export interface MediaItem {
  id: string;
  name: string;
  display_name?: string | null;
  tag: string | null;
  analyzing: boolean;
  dataUrl: string;
  url?: string;
  used?: boolean;
  createdAt?: string;
  fileSize?: number;
  fileHash?: string;
  dimensions?: string;
  isFavorite?: boolean;
  media_type?: string;
  duration?: number;
  thumbnail_url?: string;
}

export interface ApprovedPost {
  id: string;
  day: string;
  caption: string;
  tagsSummary: string;
  slideCount: number;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  mediaIds?: string[];
  status?: "draft" | "approved" | "scheduled" | "posted";
  createdAt: string;
  timezone?: string;
  usedAICaption?: boolean;
  usedAITagging?: boolean;
  usedVideo?: boolean;
}

export interface CaptionSettings {
  tone: string;
  hashtags: string[];
  maxLength: "short" | "medium" | "long";
  customInstructions?: string;
  captionPrompt?: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  mediaIds: string[];
  createdAt: string;
}

export interface AppSettings {
  notificationTime: string;
  defaultScheduleTime: string;
  preferredTags: string[];
  captionSettings: CaptionSettings;
  customTags: string[];
  hiddenBaseTags: string[];
  instagramUsername: string;
  aiCustomPreferences: string;
  carouselSize: number | "random";
  slideOrderRule: "me-first" | "tag-sequence" | "ai-free";
  tagSequence: string[];
}
