"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { PLATFORM_LABELS, PLATFORM_COLORS, formatDuration } from "@/lib/platform";
import { runWithConcurrency } from "@/lib/concurrency";
import type { MultiEntry, Platform, QueueItem } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FORMAT_OPTIONS = [
  { label: "Best Quality", id: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" },
  { label: "1080p",        id: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]" },
  { label: "720p",         id: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]" },
  { label: "480p",         id: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]" },
  { label: "Audio Only",   id: "bestaudio[ext=m4a]/bestaudio" },
];

export function MultiVideoList() {
  const { multiEntries, pageTitle, status, addToQueue, updateQueueItem, setStatus } = useStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formatIdx, setFormatIdx] = useState(0);
  const [dispatching, setDispatching] = useState(false);

  if (status !== "selecting" || !multiEntries || multiEntries.length === 0) return null;

  const allSelected = selectedIds.size === multiEntries.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(multiEntries!.map((e) => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDownloadSelected() {
    if (dispatching || selectedIds.size === 0) return;
    setDispatching(true);

    const chosen = multiEntries!.filter((e) => selectedIds.has(e.id));
    const fmt = FORMAT_OPTIONS[formatIdx];
    const platform = useStore.getState().multiEntries ? "unknown" : "unknown";

    // Build initial queue items (taskId = null until started)
    const items: QueueItem[] = chosen.map((entry) => ({
      taskId: null,
      entryId: entry.id,
      url: entry.url,
      title: entry.title,
      thumbnail: entry.thumbnail,
      platform: "unknown" as Platform,
      formatId: fmt.id,
      qualityLabel: fmt.label,
      status: "queued",
      progress: null,
      error: null,
      driveUrl: null,
    }));

    addToQueue(items);
    setStatus("queued" as any);

    // Start downloads with max 3 concurrent
    await runWithConcurrency(
      chosen.map((entry) => async () => {
        try {
          const res = await fetch(`${API}/api/download/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: entry.url,
              format_id: fmt.id,
              quality_label: fmt.label,
              title: entry.title,
              platform: "unknown",
              save_to_drive: false,
            }),
          });

          if (!res.ok) {
            updateQueueItem(entry.id, { status: "error", error: "Failed to start download." });
            return;
          }

          const { task_id } = await res.json();
          updateQueueItem(entry.id, { taskId: task_id, status: "downloading" });

          // Open WebSocket for this task
          await new Promise<void>((resolve) => {
            const wsUrl = `${API.replace("http", "ws")}/ws/progress/${task_id}`;
            const ws = new WebSocket(wsUrl);

            ws.onmessage = (event) => {
              const data = JSON.parse(event.data);

              if (data.percent !== undefined) {
                updateQueueItem(entry.id, {
                  progress: { percent: data.percent, speed: data.speed, eta: data.eta },
                });
              }

              if (data.status === "uploading") {
                updateQueueItem(entry.id, { status: "uploading" });
              }

              if (data.status === "done") {
                if (!data.drive_url) {
                  // Trigger file download
                  const a = document.createElement("a");
                  a.href = `${API}/api/download/file/${task_id}`;
                  a.style.display = "none";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => {
                    fetch(`${API}/api/download/file/${task_id}`, { method: "DELETE" }).catch(() => {});
                  }, 5000);
                }
                updateQueueItem(entry.id, {
                  status: "done",
                  driveUrl: data.drive_url ?? null,
                  progress: null,
                });
                ws.close();
                resolve();
              }

              if (data.status === "error" || data.type === "error") {
                updateQueueItem(entry.id, {
                  status: "error",
                  error: data.message || "Download failed.",
                });
                ws.close();
                resolve();
              }
            };

            ws.onerror = () => {
              updateQueueItem(entry.id, { status: "error", error: "Lost connection to server." });
              ws.close();
              resolve();
            };
          });
        } catch {
          updateQueueItem(entry.id, { status: "error", error: "Unexpected error." });
        }
      }),
      3
    );

    setDispatching(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
      style={{ maxWidth: 720 }}
    >
      {/* Header */}
      <div
        className="glass-card"
        style={{ padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <p
            className="font-display"
            style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 440 }}
          >
            {pageTitle || "Videos found"}
          </p>
          <p className="label-xs" style={{ marginTop: 4, opacity: 0.4 }}>
            {multiEntries.length} video{multiEntries.length !== 1 ? "s" : ""} found
          </p>
        </div>

        {/* Select All */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
          onClick={toggleAll}
        >
          <span className="label-xs" style={{ opacity: 0.5 }}>{allSelected ? "Deselect all" : "Select all"}</span>
          <Checkbox checked={allSelected} />
        </div>
      </div>

      {/* Scrollable entry list */}
      <div
        className="glass-card"
        style={{ padding: "8px 0", maxHeight: 420, overflowY: "auto" }}
      >
        {multiEntries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
          >
            <MultiEntryRow
              entry={entry}
              selected={selectedIds.has(entry.id)}
              onToggle={() => toggleOne(entry.id)}
            />
          </motion.div>
        ))}
      </div>

      {/* Action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
              {selectedIds.size} video{selectedIds.size !== 1 ? "s" : ""} selected
            </span>

            {/* Format selector */}
            <select
              value={formatIdx}
              onChange={(e) => setFormatIdx(Number(e.target.value))}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "rgba(255,255,255,0.7)",
                fontSize: 12,
                padding: "6px 10px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {FORMAT_OPTIONS.map((f, idx) => (
                <option key={f.id} value={idx} style={{ background: "#111" }}>
                  {f.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleDownloadSelected}
              disabled={dispatching}
              className="btn-download"
              style={{ flex: 1, minWidth: 160, opacity: dispatching ? 0.5 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M8 1v10M3 7l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {dispatching ? "Starting…" : `Download ${selectedIds.size} selected`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MultiEntryRow({ entry, selected, onToggle }: { entry: MultiEntry; selected: boolean; onToggle: () => void }) {
  const platformColor = PLATFORM_COLORS[entry.url ? detectPlatformFromUrl(entry.url) : "unknown"] ?? "#888";

  return (
    <div
      className={`multi-entry-row${selected ? " selected" : ""}`}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <Checkbox checked={selected} />

      {/* Thumbnail */}
      {entry.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.thumbnail}
          alt={entry.title}
          style={{ width: 60, height: 38, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#111" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div style={{ width: 60, height: 38, borderRadius: 6, background: "rgba(255,255,255,0.04)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/><path d="M6 6l4 2-4 2V6z" fill="rgba(255,255,255,0.2)"/></svg>
        </div>
      )}

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, color: selected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          transition: "color 0.15s",
        }}>
          {entry.title}
        </p>
        {entry.uploader && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.uploader}
          </p>
        )}
      </div>

      {/* Duration badge */}
      {entry.duration && (
        <span
          className="font-mono-data"
          style={{
            fontSize: 11, color: "rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4, padding: "2px 6px", flexShrink: 0,
          }}
        >
          {formatDuration(entry.duration)}
        </span>
      )}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: checked ? "none" : "1.5px solid rgba(255,255,255,0.2)",
        background: checked ? "#00ffff" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
        boxShadow: checked ? "0 0 6px rgba(0,255,255,0.4)" : "none",
      }}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l3 3 5-6" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

function detectPlatformFromUrl(url: string): Platform {
  const PATTERNS: [Platform, RegExp][] = [
    ["youtube", /(youtube\.com|youtu\.be)/i],
    ["tiktok", /tiktok\.com/i],
    ["instagram", /instagram\.com/i],
    ["facebook", /(facebook\.com|fb\.com)/i],
    ["reddit", /reddit\.com/i],
    ["twitter", /(twitter\.com|x\.com)/i],
    ["pornhub", /pornhub\.com/i],
    ["xvideos", /xvideos\.com/i],
    ["xnxx", /xnxx\.com/i],
    ["redtube", /redtube\.com/i],
    ["linkedin", /linkedin\.com/i],
    ["bbc", /bbc\.(co\.uk|com)/i],
    ["cnn", /cnn\.com/i],
    ["twitch", /twitch\.tv/i],
    ["vimeo", /vimeo\.com/i],
  ];
  for (const [p, re] of PATTERNS) {
    if (re.test(url)) return p;
  }
  return "unknown";
}
