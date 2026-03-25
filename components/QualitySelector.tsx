"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { formatBytes } from "@/lib/platform";

export function QualitySelector() {
  const { metadata, selectedFormat, setSelectedFormat, saveToDrive, setSaveToDrive, driveConnected } = useStore();

  if (!metadata?.formats?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="w-full max-w-3xl mx-auto space-y-4"
    >
      {/* Format cards */}
      <div className="flex flex-wrap gap-2">
        {metadata.formats.map((fmt) => {
          const isSelected = selectedFormat?.format_id === fmt.format_id;
          return (
            <button
              key={fmt.format_id}
              onClick={() => setSelectedFormat(fmt)}
              className={`card-dark rounded-lg px-4 py-3 text-left transition-all ${isSelected ? "selected" : ""}`}
            >
              <div className="text-sm font-semibold" style={{ color: isSelected ? "#00ffff" : "#fff" }}>
                {fmt.label}
              </div>
              {fmt.filesize && (
                <div className="text-xs text-white/30 mt-0.5">{formatBytes(fmt.filesize)}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Google Drive toggle — only visible if Drive is connected */}
      {driveConnected && (
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <div
            onClick={() => setSaveToDrive(!saveToDrive)}
            className={`relative w-10 h-5 rounded-full transition-colors ${saveToDrive ? "bg-[#00ffff]" : "bg-[#1a1a1a] border border-[#333]"}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${saveToDrive ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
          <span className="text-sm text-white/60">Save directly to Google Drive</span>
        </label>
      )}
    </motion.div>
  );
}
