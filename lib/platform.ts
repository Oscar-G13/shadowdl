import type { Platform } from "./types";

const patterns: Record<Platform, RegExp> = {
  youtube: /(youtube\.com|youtu\.be)/i,
  tiktok: /tiktok\.com/i,
  instagram: /instagram\.com/i,
  facebook: /(facebook\.com|fb\.com|fb\.watch)/i,
  reddit: /reddit\.com/i,
  twitter: /(twitter\.com|x\.com)/i,
  unknown: /^$/,
};

export function detectPlatform(url: string): Platform {
  for (const [platform, re] of Object.entries(patterns)) {
    if (platform === "unknown") continue;
    if (re.test(url)) return platform as Platform;
  }
  return "unknown";
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  reddit: "Reddit",
  twitter: "X / Twitter",
  unknown: "Unknown",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: "#ff0000",
  tiktok: "#00f2ea",
  instagram: "#e1306c",
  facebook: "#1877f2",
  reddit: "#ff4500",
  twitter: "#1d9bf0",
  unknown: "#888",
};

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
