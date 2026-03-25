"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { UrlInput } from "@/components/UrlInput";
import { VideoPreview } from "@/components/VideoPreview";
import { QualitySelector } from "@/components/QualitySelector";
import { DownloadButton } from "@/components/DownloadButton";
import { ProgressTracker } from "@/components/ProgressTracker";
import { FetchingState } from "@/components/FetchingState";
import { DriveConnect } from "@/components/DriveConnect";
import { HistoryPanel } from "@/components/HistoryPanel";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Handles the ?drive=connected query param that the OAuth callback redirects to
function DriveCallbackHandler() {
  const params = useSearchParams();
  const { setDriveStatus } = useStore();

  useEffect(() => {
    if (params.get("drive") === "connected") {
      const email = params.get("email") ?? null;
      setDriveStatus(true, email);
      // Clean the URL
      window.history.replaceState({}, "", "/");
    }
  }, [params, setDriveStatus]);

  return null;
}

export default function Home() {
  const { status, metadata } = useStore();
  const showVideoInfo = metadata && (status === "ready" || status === "downloading" || status === "uploading" || status === "done" || status === "error");

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#0d0d0d]">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2"
        >
          <span className="text-[#00ffff] font-bold text-xl tracking-tight glow-text">Shadow</span>
          <span className="text-white font-bold text-xl tracking-tight">DL</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-5"
        >
          <HistoryPanel />
          <DriveConnect />
        </motion.div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-8">
        {/* Hero headline — fades out once we have a video */}
        {status === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-2 mb-4"
          >
            <h1 className="text-4xl font-bold tracking-tight">
              Download anything.{" "}
              <span className="text-[#00ffff] glow-text">Instantly.</span>
            </h1>
            <p className="text-white/30 text-sm">
              YouTube · TikTok · Instagram · Facebook · Reddit · X
            </p>
          </motion.div>
        )}

        {/* URL input */}
        <UrlInput />

        {/* Loading dots */}
        <FetchingState />

        {/* Video info + quality selector */}
        {showVideoInfo && (
          <>
            <VideoPreview />
            <QualitySelector />
            <DownloadButton />
          </>
        )}

        {/* Progress / success / error */}
        <ProgressTracker />
      </main>

      {/* Footer */}
      <footer className="text-center pb-6 text-[10px] text-white/10 tracking-widest uppercase">
        ShadowDL — No watermarks. No streaming.
      </footer>

      {/* Handles ?drive=connected redirect */}
      <Suspense>
        <DriveCallbackHandler />
      </Suspense>
    </div>
  );
}
