"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/platform";
import type { QueueItem } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function DownloadQueue() {
  const { downloadQueue, clearQueue } = useStore();

  if (downloadQueue.length === 0) return null;

  const allSettled = downloadQueue.every((i) => i.status === "done" || i.status === "error");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
      style={{ maxWidth: 720 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p className="label-xs" style={{ opacity: 0.5 }}>
          Download Queue — {downloadQueue.length} item{downloadQueue.length !== 1 ? "s" : ""}
        </p>
        {allSettled && (
          <button
            onClick={clearQueue}
            className="btn-ghost"
            style={{ fontSize: 11, padding: "3px 8px" }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <AnimatePresence initial={false}>
          {downloadQueue.map((item, i) => (
            <motion.div
              key={item.entryId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
            >
              <QueueItemRow item={item} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function QueueItemRow({ item }: { item: QueueItem }) {
  const platformColor = PLATFORM_COLORS[item.platform] ?? "#888";
  const platformLabel = PLATFORM_LABELS[item.platform] ?? item.platform;

  const statusColor =
    item.status === "done" ? "#00ff88" :
    item.status === "error" ? "#ff4444" :
    item.status === "queued" ? "rgba(255,255,255,0.3)" :
    "#00ffff";

  const statusLabel =
    item.status === "queued" ? "Queued" :
    item.status === "downloading" ? `${item.progress?.percent?.toFixed(0) ?? 0}%` :
    item.status === "uploading" ? "Uploading" :
    item.status === "done" ? "Done" :
    "Error";

  return (
    <div
      className="glass-card"
      style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Thumbnail */}
        {item.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail}
            alt={item.title}
            style={{ width: 40, height: 26, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div style={{ width: 40, height: 26, borderRadius: 4, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
        )}

        {/* Title */}
        <p style={{
          flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </p>

        {/* Speed / ETA */}
        {item.status === "downloading" && item.progress && (
          <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
            {item.progress.speed} · ETA {item.progress.eta}
          </span>
        )}

        {/* Status badge */}
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
          color: statusColor,
          background: `${statusColor}14`,
          border: `1px solid ${statusColor}30`,
          borderRadius: 4, padding: "2px 7px", flexShrink: 0,
          fontFamily: "var(--font-mono)",
        }}>
          {statusLabel}
        </span>

        {/* Done: download link */}
        {item.status === "done" && item.taskId && !item.driveUrl && (
          <a
            href={`${API}/api/download/file/${item.taskId}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 6,
              border: "1px solid rgba(0,255,136,0.25)",
              background: "rgba(0,255,136,0.08)",
              color: "#00ff88",
              flexShrink: 0,
              textDecoration: "none",
            }}
            title="Download again"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M2.5 5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 10.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </a>
        )}

        {/* Done: Drive link */}
        {item.status === "done" && item.driveUrl && (
          <a
            href={item.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: "rgba(0,255,255,0.6)", textDecoration: "none", flexShrink: 0 }}
          >
            Drive ↗
          </a>
        )}
      </div>

      {/* Error message */}
      {item.status === "error" && item.error && (
        <p style={{ fontSize: 11, color: "rgba(255,80,80,0.7)", paddingLeft: 50 }}>
          {item.error}
        </p>
      )}

      {/* Progress bar */}
      {(item.status === "downloading" || item.status === "uploading") && (
        <div style={{ paddingLeft: 50 }}>
          <div className="progress-track" style={{ height: 2 }}>
            <div
              className="progress-fill"
              style={{ width: `${item.progress?.percent ?? 0}%`, height: 2 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
