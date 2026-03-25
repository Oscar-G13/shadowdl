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
  is_playlist?: boolean;
  playlist_count?: number;
  playlist_title?: string;
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
  thumbnail?: string | null;
  tags?: string | null;
}

export interface BatchItem {
  id: string;
  url: string;
  status: "pending" | "fetching" | "downloading" | "done" | "error";
  title?: string;
  platform?: string;
  thumbnail?: string;
  format?: Format | null;
  progress?: ProgressInfo | null;
  error?: string;
  taskId?: string;
  driveUrl?: string | null;
}

export interface Preset {
  id: number;
  name: string;
  format_id: string;
  quality_label: string;
  save_to_drive: number;
  created_at: string;
}

export interface Schedule {
  id: number;
  url: string;
  title: string;
  cron_expr: string;
  format_id: string | null;
  quality_label: string;
  enabled: number;
  last_run: string | null;
  next_run?: string | null;
  created_at: string;
}

export interface AnalyticsData {
  total_downloads: number;
  by_platform: Record<string, number>;
  by_day: { date: string; count: number }[];
  drive_saves: number;
}

export interface AiRecommendation {
  recommended_label: string;
  reason: string;
  tip: string;
}

export type ActiveView = "download" | "queue" | "history" | "toolkit" | "schedule";
