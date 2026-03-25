"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { PLATFORM_LABELS, PLATFORM_COLORS, formatDuration } from "@/lib/platform";

export function VideoPreview() {
  const { metadata } = useStore();
  if (!metadata) return null;

  const platformLabel = PLATFORM_LABELS[metadata.platform] ?? metadata.platform;
  const platformColor = PLATFORM_COLORS[metadata.platform] ?? "#888";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex gap-5 overflow-hidden"
      style={{ padding: "20px" }}
    >
      {/* Thumbnail */}
      {metadata.thumbnail && (
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ width: 160, height: 100, borderRadius: 10, background: "#111" }}
        >
          <Image
            src={metadata.thumbnail}
            alt={metadata.title}
            fill
            className="object-cover"
            unoptimized
          />
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)" }}
          />
          {/* Duration badge */}
          {metadata.duration && (
            <div
              className="absolute bottom-2 right-2 font-mono-data"
              style={{
                fontSize: "11px",
                fontWeight: 500,
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                padding: "2px 6px",
                borderRadius: 5,
                backdropFilter: "blur(4px)",
              }}
            >
              {formatDuration(metadata.duration)}
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col justify-center gap-2.5 min-w-0 flex-1">
        {/* Platform badge */}
        <div className="flex items-center gap-2">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: platformColor,
              background: `${platformColor}14`,
              border: `1px solid ${platformColor}30`,
              borderRadius: 6,
              padding: "3px 8px",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: platformColor, display: "inline-block", boxShadow: `0 0 6px ${platformColor}` }} />
            {platformLabel}
          </span>
        </div>

        {/* Title */}
        <p
          className="text-white font-medium leading-snug"
          style={{ fontSize: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {metadata.title}
        </p>

        {/* Uploader */}
        {metadata.uploader && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {metadata.uploader}
          </p>
        )}
      </div>
    </motion.div>
  );
}
