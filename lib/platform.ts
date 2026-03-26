import type { Platform } from "./types";

const patterns: Partial<Record<Platform, RegExp>> = {
  youtube:     /(youtube\.com|youtu\.be)/i,
  tiktok:      /tiktok\.com/i,
  instagram:   /instagram\.com/i,
  facebook:    /(facebook\.com|fb\.com|fb\.watch)/i,
  reddit:      /reddit\.com/i,
  twitter:     /(twitter\.com|x\.com)/i,
  pornhub:     /pornhub\.com/i,
  xvideos:     /xvideos\.com/i,
  xnxx:        /xnxx\.com/i,
  redtube:     /redtube\.com/i,
  linkedin:    /linkedin\.com/i,
  bbc:         /bbc\.(co\.uk|com)/i,
  cnn:         /cnn\.com/i,
  aljazeera:   /aljazeera\.com/i,
  reuters:     /reuters\.com/i,
  twitch:      /twitch\.tv/i,
  vimeo:       /vimeo\.com/i,
  dailymotion: /dailymotion\.com/i,
  bilibili:    /bilibili\.com/i,
  rumble:      /rumble\.com/i,
  odysee:      /odysee\.com/i,
  streamable:  /streamable\.com/i,
};

export function detectPlatform(url: string): Platform {
  for (const [platform, re] of Object.entries(patterns)) {
    if (re!.test(url)) return platform as Platform;
  }
  return "unknown";
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube:     "YouTube",
  tiktok:      "TikTok",
  instagram:   "Instagram",
  facebook:    "Facebook",
  reddit:      "Reddit",
  twitter:     "X / Twitter",
  pornhub:     "Pornhub",
  xvideos:     "XVideos",
  xnxx:        "XNXX",
  redtube:     "Redtube",
  linkedin:    "LinkedIn",
  bbc:         "BBC",
  cnn:         "CNN",
  aljazeera:   "Al Jazeera",
  reuters:     "Reuters",
  twitch:      "Twitch",
  vimeo:       "Vimeo",
  dailymotion: "Dailymotion",
  bilibili:    "Bilibili",
  rumble:      "Rumble",
  odysee:      "Odysee",
  streamable:  "Streamable",
  unknown:     "Unknown",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  youtube:     "#ff0000",
  tiktok:      "#00f2ea",
  instagram:   "#e1306c",
  facebook:    "#1877f2",
  reddit:      "#ff4500",
  twitter:     "#1d9bf0",
  pornhub:     "#ff9000",
  xvideos:     "#e60000",
  xnxx:        "#ffcc00",
  redtube:     "#cc0000",
  linkedin:    "#0077b5",
  bbc:         "#bb1919",
  cnn:         "#cc0000",
  aljazeera:   "#c8102e",
  reuters:     "#ff8000",
  twitch:      "#9146ff",
  vimeo:       "#1ab7ea",
  dailymotion: "#0066dc",
  bilibili:    "#00a1d6",
  rumble:      "#85c742",
  odysee:      "#e4277c",
  streamable:  "#37d67a",
  unknown:     "#888",
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
