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
import { SubtitlePanel } from "@/components/SubtitlePanel";
import { QueueView } from "@/components/QueueView";
import { HistoryView } from "@/components/HistoryView";
import { ToolkitView } from "@/components/ToolkitView";
import { ScheduleView } from "@/components/ScheduleView";
import { CommandPalette } from "@/components/CommandPalette";
import type { ActiveView } from "@/lib/types";

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

const TABS: { id: ActiveView; label: string }[] = [
  { id: "download", label: "Download" },
  { id: "queue", label: "Queue" },
  { id: "history", label: "History" },
  { id: "toolkit", label: "Toolkit" },
  { id: "schedule", label: "Schedule" },
];

const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "Reddit", "X"];

export default function Home() {
  const { activeView, setActiveView, status, metadata, setCommandPaletteOpen } = useStore();
  const isIdle = status === "idle";
  const showVideoInfo = metadata && ["ready", "downloading", "uploading", "done", "error"].includes(status);

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ─────────────────────────────────────── */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 24px", height: 56 }}>
          {/* Logo */}
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            onClick={() => setActiveView("download")}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }}
          >
            <div style={{ position: "relative", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: 0, border: "1px solid #00ffff", opacity: 0.4, clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
              <div style={{ width: 7, height: 7, borderRadius: 2, background: "#00ffff", boxShadow: "0 0 8px #00ffff" }} />
            </div>
            <span className="font-display" style={{ fontSize: 16, letterSpacing: "0.2em", textTransform: "uppercase" }}>
              <span className="text-cyan glow-cyan">Shadow</span>
              <span style={{ color: "rgba(255,255,255,0.9)" }}>DL</span>
            </span>
          </motion.button>

          {/* Nav tabs — center */}
          <motion.nav
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            style={{ display: "flex", gap: 2, flex: 1, justifyContent: "center" }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`nav-tab ${activeView === tab.id ? "active" : ""}`}
                onClick={() => setActiveView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </motion.nav>

          {/* Right: ⌘K + Drive */}
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
          >
            <button
              onClick={() => setCommandPaletteOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px",
                borderRadius: 7,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.3)",
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.18)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5" cy="5" r="3.8" stroke="currentColor" strokeWidth="1.2"/><path d="M8 8l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <kbd style={{ fontFamily: "inherit", fontSize: 10 }}>⌘K</kbd>
            </button>
            <DriveConnect />
          </motion.div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────── */}
      <main style={{ flex: 1, padding: "32px 24px 48px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {/* ── Download view ── */}
            {activeView === "download" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
                {/* Hero text — only when idle */}
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
                          <span key={p} className="label-xs">
                            {p}{i < PLATFORMS.length - 1 && <span style={{ marginLeft: 8, opacity: 0.3 }}>·</span>}
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
                      <SubtitlePanel />
                      <DownloadButton />
                    </motion.div>
                  )}
                </AnimatePresence>

                <ProgressTracker />
              </div>
            )}

            {/* ── Queue view ── */}
            {activeView === "queue" && <QueueView />}

            {/* ── History view ── */}
            {activeView === "history" && <HistoryView />}

            {/* ── Toolkit view ── */}
            {activeView === "toolkit" && <ToolkitView />}

            {/* ── Schedule view ── */}
            {activeView === "schedule" && <ScheduleView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer style={{ textAlign: "center", padding: "16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="label-xs" style={{ opacity: 0.4 }}>No watermarks · No streaming · No bullshit</span>
      </footer>

      <CommandPalette />
      <Suspense><DriveCallbackHandler /></Suspense>
    </div>
  );
}
