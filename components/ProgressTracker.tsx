"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

export function ProgressTracker() {
  const { status, progress, error, driveUrl, reset } = useStore();

  if (status === "idle" || status === "ready" || status === "fetching") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-3xl mx-auto"
      >
        {/* Downloading / uploading */}
        {(status === "downloading" || status === "uploading") && (
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-white/40">
              <span>{status === "uploading" ? "Uploading to Google Drive…" : "Downloading…"}</span>
              {progress && (
                <span>{progress.speed} · ETA {progress.eta}</span>
              )}
            </div>
            <div className="h-1 bg-[#111] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#00ffff] rounded-full"
                style={{ width: `${progress?.percent ?? 0}%` }}
                transition={{ type: "spring", damping: 20 }}
              />
            </div>
            {progress && (
              <div className="text-right text-xs text-[#00ffff] font-mono">
                {progress.percent.toFixed(1)}%
              </div>
            )}
          </div>
        )}

        {/* Success */}
        {status === "done" && (
          <div className="card-dark rounded-xl p-6 text-center space-y-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="text-4xl"
            >
              ✓
            </motion.div>
            <p className="text-[#00ffff] font-semibold glow-text">Download complete</p>
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="neon-btn text-xs px-4 py-2 rounded inline-block"
              >
                Open in Google Drive
              </a>
            )}
            <div>
              <button
                onClick={reset}
                className="text-xs text-white/30 hover:text-white/60 transition-colors mt-2"
              >
                Download another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && error && (
          <div className="card-dark rounded-xl p-5 border-red-900/50">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={reset}
              className="text-xs text-white/30 hover:text-white/60 mt-3 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
