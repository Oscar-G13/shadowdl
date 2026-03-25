"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

export function ProgressTracker() {
  const { status, progress, error, driveUrl, reset } = useStore();

  if (["idle", "ready", "fetching"].includes(status)) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-2xl mx-auto"
      >

        {/* ── Downloading / Uploading ── */}
        {(status === "downloading" || status === "uploading") && (
          <div className="glass-card" style={{ padding: "28px 28px 24px" }}>
            {/* Status label */}
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ffff", boxShadow: "0 0 8px #00ffff", animation: "glow-pulse 1.2s ease-in-out infinite" }} />
                <span className="label-xs" style={{ color: "rgba(0,255,255,0.7)" }}>
                  {status === "uploading" ? "Uploading to Drive" : "Downloading"}
                </span>
              </div>
              {progress && (
                <span className="font-mono-data" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                  {progress.speed} · ETA {progress.eta}
                </span>
              )}
            </div>

            {/* Percentage */}
            <div className="text-center" style={{ marginBottom: 16 }}>
              <span
                className="font-mono-data"
                style={{ fontSize: 48, fontWeight: 500, color: "#00ffff", lineHeight: 1, textShadow: "0 0 20px rgba(0,255,255,0.4)" }}
              >
                {(progress?.percent ?? 0).toFixed(0)}
              </span>
              <span className="font-mono-data" style={{ fontSize: 18, color: "rgba(0,255,255,0.5)", marginLeft: 2 }}>%</span>
            </div>

            {/* Progress bar */}
            <div className="progress-track">
              <motion.div
                className="progress-fill"
                animate={{ width: `${progress?.percent ?? 0}%` }}
                transition={{ ease: "linear", duration: 0.4 }}
              />
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {status === "done" && (
          <div className="glass-card text-center" style={{ padding: "40px 28px" }}>
            {/* Animated circle + check */}
            <div className="flex justify-center" style={{ marginBottom: 20 }}>
              <div style={{ position: "relative", width: 64, height: 64 }}>
                {/* Glow ring */}
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1.4, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                  style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    border: "1px solid rgba(0,255,255,0.6)",
                  }}
                />
                {/* Circle */}
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <motion.circle
                    cx="32" cy="32" r="28"
                    stroke="#00ffff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="176"
                    strokeDashoffset="176"
                    style={{ filter: "drop-shadow(0 0 6px rgba(0,255,255,0.8))" }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                  {/* Checkmark */}
                  <motion.path
                    d="M20 32l8 8 16-16"
                    stroke="#00ffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="36"
                    strokeDashoffset="36"
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
                  />
                </svg>
              </div>
            </div>

            <p
              className="font-display text-white"
              style={{ fontSize: 20, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}
            >
              Complete
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 24 }}>
              {driveUrl ? "Saved to your Google Drive." : "Your file is downloading."}
            </p>

            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline"
                style={{ display: "inline-block", marginBottom: 16 }}
              >
                Open in Google Drive →
              </a>
            )}

            <div>
              <button
                onClick={reset}
                className="btn-ghost"
                style={{ display: "block", margin: "0 auto" }}
              >
                Download another
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && error && (
          <div
            className="glass-card"
            style={{ padding: "24px 28px", borderColor: "rgba(255,60,60,0.2)" }}
          >
            <div className="flex items-start gap-3">
              <div style={{ marginTop: 2, flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="rgba(255,80,80,0.7)" strokeWidth="1.2"/>
                  <path d="M8 4.5v4M8 11h.01" stroke="rgba(255,100,100,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, color: "rgba(255,100,100,0.9)", marginBottom: 10, lineHeight: 1.5 }}>
                  {error}
                </p>
                <button onClick={reset} className="btn-ghost" style={{ fontSize: 12 }}>
                  Try again →
                </button>
              </div>
            </div>
          </div>
        )}

      </motion.div>
    </AnimatePresence>
  );
}
