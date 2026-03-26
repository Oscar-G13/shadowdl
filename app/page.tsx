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
import { CookiesButton } from "@/components/CookiesModal";
import { MultiVideoList } from "@/components/MultiVideoList";
import { DownloadQueue } from "@/components/DownloadQueue";

const PLATFORMS: { label: string; color: string }[] = [
  { label: "YouTube",   color: "#ff0000" },
  { label: "TikTok",    color: "#00f2ea" },
  { label: "Pornhub",   color: "#ff9000" },
  { label: "LinkedIn",  color: "#0077b5" },
  { label: "BBC",       color: "#bb1919" },
  { label: "Twitch",    color: "#9146ff" },
  { label: "1800+ sites", color: "rgba(255,255,255,0.3)" },
];

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

export default function Home() {
  const { status, metadata, multiEntries } = useStore();
  const isIdle = status === "idle";
  const showVideoInfo = metadata && metadata.type === "single" && ["ready", "downloading", "uploading", "done", "error"].includes(status);

  return (
    <div className="min-h-screen flex flex-col">

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: 0, border: "1px solid #00ffff", opacity: 0.4, clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
              <div style={{ width: 7, height: 7, borderRadius: 2, background: "#00ffff", boxShadow: "0 0 8px #00ffff" }} />
            </div>
            <span className="font-display" style={{ fontSize: 16, letterSpacing: "0.2em", textTransform: "uppercase" }}>
              <span className="text-cyan glow-cyan">Shadow</span>
              <span style={{ color: "rgba(255,255,255,0.9)" }}>DL</span>
            </span>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CookiesButton />
            <HistoryPanel />
            <DriveConnect />
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, padding: "32px 24px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>

          {/* Hero */}
          <AnimatePresence>
            {isIdle && (
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                transition={{ duration: 0.6 }}
                className="text-center"
                style={{ marginBottom: 4 }}
              >
                <h1 className="font-display" style={{ fontSize: "clamp(32px,5vw,52px)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 14 }}>
                  Download{" "}
                  <span className="text-cyan glow-cyan">anything</span>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>.</span>
                </h1>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                  {PLATFORMS.map((p, i) => (
                    <span key={p.label} className="label-xs">
                      <span style={{ color: p.color, textShadow: `0 0 8px ${p.color}66` }}>{p.label}</span>
                      {i < PLATFORMS.length - 1 && <span style={{ marginLeft: 8, opacity: 0.3 }}>·</span>}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <UrlInput />
          <FetchingState />

          <AnimatePresence>
            {showVideoInfo && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}
              >
                <VideoPreview />
                <QualitySelector />
                <DownloadButton />
              </motion.div>
            )}
          </AnimatePresence>

          <ProgressTracker />

          {/* Multi-video selection */}
          <AnimatePresence>
            {status === "selecting" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{ width: "100%", display: "flex", justifyContent: "center" }}
              >
                <MultiVideoList />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download queue (always mounted, self-hides when empty) */}
          <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
            <DownloadQueue />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="label-xs" style={{ opacity: 0.4 }}>No watermarks · No streaming · No bullshit</span>
      </footer>

      <Suspense><DriveCallbackHandler /></Suspense>
    </div>
  );
}
