"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { UrlInput } from "@/components/UrlInput";
import { VideoPreview } from "@/components/VideoPreview";
import { QualitySelector } from "@/components/QualitySelector";
import { DownloadButton } from "@/components/DownloadButton";
import { ProgressTracker } from "@/components/ProgressTracker";
import { FetchingState } from "@/components/FetchingState";
import { DriveConnect } from "@/components/DriveConnect";
import { HistoryPanel } from "@/components/HistoryPanel";

function DriveCallbackHandler() {
  const params = useSearchParams();
  const { setDriveStatus } = useStore();
  useEffect(() => {
    if (params.get("drive") === "connected") {
      setDriveStatus(true, params.get("email") ?? null);
      window.history.replaceState({}, "", "/");
    }
  }, [params, setDriveStatus]);
  return null;
}

const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "Reddit", "X"];

export default function Home() {
  const { status, metadata } = useStore();
  const isIdle = status === "idle";
  const showVideoInfo = metadata && ["ready", "downloading", "uploading", "done", "error"].includes(status);

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          {/* Logo mark */}
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 border border-[#00ffff] opacity-40" style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
            <div className="w-2 h-2 rounded-sm bg-[#00ffff]" style={{ boxShadow: "0 0 8px #00ffff" }} />
          </div>
          <span className="font-display text-lg tracking-widest uppercase" style={{ letterSpacing: "0.2em" }}>
            <span className="text-cyan glow-cyan">Shadow</span>
            <span className="text-white opacity-90">DL</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-6"
        >
          <HistoryPanel />
          <DriveConnect />
        </motion.div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20" style={{ gap: "28px" }}>

        {/* Hero text — only when idle */}
        <AnimatePresence>
          {isIdle && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.6 }}
              className="text-center"
              style={{ marginBottom: "4px" }}
            >
              <h1
                className="font-display text-5xl tracking-tight leading-none mb-4"
                style={{ letterSpacing: "-0.02em" }}
              >
                Download{" "}
                <span className="text-cyan glow-cyan">anything</span>
                <span className="text-white opacity-30">.</span>
              </h1>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {PLATFORMS.map((p, i) => (
                  <span
                    key={p}
                    className="label-xs"
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    {p}{i < PLATFORMS.length - 1 && <span className="ml-2 opacity-30">·</span>}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* URL input — always visible */}
        <UrlInput />

        {/* Fetching state */}
        <FetchingState />

        {/* Video result */}
        <AnimatePresence>
          {showVideoInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-2xl mx-auto flex flex-col"
              style={{ gap: "16px" }}
            >
              <VideoPreview />
              <QualitySelector />
              <DownloadButton />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress / success / error */}
        <ProgressTracker />
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="text-center py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="label-xs opacity-50">No watermarks · No streaming · No bullshit</span>
      </footer>

      <Suspense><DriveCallbackHandler /></Suspense>
    </div>
  );
}
