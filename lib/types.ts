export type Platform =
  | "youtube" | "tiktok" | "instagram" | "facebook" | "reddit" | "twitter"
  | "pornhub" | "xvideos" | "xnxx" | "redtube" | "linkedin"
  | "bbc" | "cnn" | "aljazeera" | "reuters"
  | "twitch" | "vimeo" | "dailymotion" | "bilibili" | "rumble" | "odysee" | "streamable"
  | "unknown";

export interface Format {
  format_id: string;
  label: string;
  ext: string;
  filesize: number | null;
  height: number | null;
  vcodec?: string;
  acodec?: string;
}

export interface SingleVideoMetadata {
  type: "single";
  title: string;
  thumbnail: string | null;
  duration: number | null;
  platform: Platform;
  uploader: string | null;
  formats: Format[];
  raw_id?: string;
}

export interface MultiEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
}

export interface MultiVideoMetadata {
  type: "multi";
  page_title: string;
  platform: Platform;
  count: number;
  entries: MultiEntry[];
}

export type VideoMetadata = SingleVideoMetadata | MultiVideoMetadata;

export type QueueItemStatus = "queued" | "downloading" | "uploading" | "done" | "error";

export interface QueueItem {
  taskId: string | null;
  entryId: string;
  url: string;
  title: string;
  thumbnail: string | null;
  platform: Platform;
  formatId: string;
  qualityLabel: string;
  status: QueueItemStatus;
  progress: ProgressInfo | null;
  error: string | null;
  driveUrl: string | null;
}

export type DownloadStatus =
  | "idle"
  | "fetching"
  | "ready"
  | "selecting"
  | "downloading"
  | "uploading"
  | "done"
  | "error";

export interface ProgressInfo {
  percent: number;
  speed: string;
  eta: string;
}

export interface HistoryItem {
  id: number;
  title: string;
  platform: string;
  quality: string;
  url: string;
  downloaded_at: string;
  saved_to_drive: number;
}
