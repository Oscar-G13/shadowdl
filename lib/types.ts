export type Platform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "reddit"
  | "twitter"
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

export interface VideoMetadata {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  platform: Platform;
  uploader: string | null;
  formats: Format[];
}

export type DownloadStatus =
  | "idle"
  | "fetching"
  | "ready"
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
