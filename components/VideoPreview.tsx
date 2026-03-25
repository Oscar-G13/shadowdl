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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-3xl mx-auto card-dark rounded-xl p-5 flex gap-5"
    >
      {/* Thumbnail */}
      {metadata.thumbnail && (
        <div className="relative shrink-0 w-40 h-24 rounded-lg overflow-hidden bg-[#111]">
          <Image
            src={metadata.thumbnail}
            alt={metadata.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col justify-center gap-2 min-w-0">
        {/* Platform badge */}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
          style={{ color: platformColor, border: `1px solid ${platformColor}40`, background: `${platformColor}15` }}
        >
          {platformLabel}
        </span>

        <p className="text-white font-medium text-sm leading-snug line-clamp-2">
          {metadata.title}
        </p>

        <div className="flex items-center gap-3 text-xs text-white/40">
          {metadata.duration && (
            <span>{formatDuration(metadata.duration)}</span>
          )}
          {metadata.uploader && (
            <span className="truncate">{metadata.uploader}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
