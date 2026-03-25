"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import type { BatchItem, Format } from "@/lib/types";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platform";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_CONCURRENT = 3;

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function QueueView() {
  const { batchItems, setBatchItems, addBatchItems, updateBatchItem, removeBatchItem } = useStore();
  const [urlText, setUrlText] = useState("");
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(0);

  function parseUrls(raw: string): string[] {
    return raw.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      setUrlText((prev) => (prev ? prev + "\n" + text : text));
    };
    reader.readAsText(file);
  }

  async function fetchMeta(item: BatchItem): Promise<void> {
    updateBatchItem(item.id, { status: "fetching" });
    try {
      const res = await fetch(`${API}/api/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      if (!res.ok) throw new Error("Could not fetch info");
      const meta = await res.json();
      const fmt: Format = meta.formats?.[0] ?? null;
      updateBatchItem(item.id, {
        title: meta.title,
        platform: meta.platform,
        thumbnail: meta.thumbnail ?? undefined,
        format: fmt,
        status: "pending",
      });
    } catch (e: unknown) {
      updateBatchItem(item.id, { status: "error", error: e instanceof Error ? e.message : "Fetch failed" });
    }
  }

  async function downloadItem(item: BatchItem): Promise<void> {
    const current = useStore.getState().batchItems.find((i) => i.id === item.id);
    if (!current?.format) {
      updateBatchItem(item.id, { status: "error", error: "No format selected" });
      return;
    }
    updateBatchItem(item.id, { status: "downloading", progress: { percent: 0, speed: "–", eta: "–" } });
    try {
      const res = await fetch(`${API}/api/download/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: current.url,
          format_id: current.format.format_id,
          quality_label: current.format.label,
          title: current.title ?? "Video",
          platform: current.platform ?? "unknown",
          save_to_drive: false,
        }),
      });
      if (!res.ok) throw new Error("Start failed");
      const { task_id } = await res.json();
      updateBatchItem(item.id, { taskId: task_id });

      await new Promise<void>((resolve, reject) => {
        const wsUrl = `${API.replace("http", "ws")}/ws/progress/${task_id}`;
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.percent !== undefined) {
            updateBatchItem(item.id, { progress: { percent: data.percent, speed: data.speed, eta: data.eta } });
          }
          if (data.status === "done") {
            // trigger browser download
            const a = document.createElement("a");
            a.href = `${API}/api/download/file/${task_id}`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => fetch(`${API}/api/download/file/${task_id}`, { method: "DELETE" }).catch(() => {}), 5000);
            updateBatchItem(item.id, { status: "done", progress: { percent: 100, speed: "–", eta: "0s" } });
            ws.close();
            resolve();
          }
          if (data.status === "error" || data.type === "error") {
            updateBatchItem(item.id, { status: "error", error: data.message ?? "Download failed" });
            ws.close();
            reject(new Error(data.message));
          }
        };
        ws.onerror = () => { reject(new Error("WS error")); };
      });
    } catch (e: unknown) {
      updateBatchItem(item.id, { status: "error", error: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function startQueue(items: BatchItem[]) {
    setRunning(true);
    activeRef.current = 0;

    // First fetch all metadata in parallel
    const pending = items.filter((i) => !i.title);
    await Promise.all(pending.map(fetchMeta));

    // Then download with concurrency limit
    const queue = [...items];
    const workers = Array.from({ length: MAX_CONCURRENT }, async () => {
      while (true) {
        const item = queue.find((i) => {
          const cur = useStore.getState().batchItems.find((b) => b.id === i.id);
          return cur?.status === "pending";
        });
        if (!item) break;
        // Mark as claimed
        updateBatchItem(item.id, { status: "downloading" });
        await downloadItem(item);
      }
    });
    await Promise.all(workers);
    setRunning(false);
  }

  function handleAdd() {
    const urls = parseUrls(urlText);
    if (!urls.length) return;
    const newItems: BatchItem[] = urls.map((url) => ({ id: genId(), url, status: "pending" }));
    addBatchItems(newItems);
    setUrlText("");
    // Auto-fetch metadata
    newItems.forEach(fetchMeta);
  }

  function handleStartAll() {
    const pending = batchItems.filter((i) => i.status === "pending" || i.status === "error");
    if (!pending.length) return;
    startQueue(pending);
  }

  function clearDone() {
    setBatchItems(batchItems.filter((i) => i.status !== "done"));
  }

  const stats = {
    pending: batchItems.filter((i) => i.status === "pending").length,
    active: batchItems.filter((i) => i.status === "downloading" || i.status === "fetching").length,
    done: batchItems.filter((i) => i.status === "done").length,
    error: batchItems.filter((i) => i.status === "error").length,
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Input area */}
      <div className="glass-card" style={{ padding: "24px" }}>
        <p className="label-xs" style={{ marginBottom: 10 }}>Paste URLs</p>
        <textarea
          className="field-textarea"
          rows={4}
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder={"https://youtube.com/watch?v=...\nhttps://tiktok.com/@...\nhttps://instagram.com/p/..."}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={handleAdd} disabled={!urlText.trim()} className="btn-outline" style={{ flex: 1, maxWidth: 140 }}>
            Add to Queue
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 4l3-3 3 3M1 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Upload .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt,.csv" style={{ display: "none" }} onChange={handleFileUpload} />
        </div>
      </div>

      {/* Queue */}
      {batchItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Stats + controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {stats.active > 0 && <span className="badge badge-cyan">{stats.active} active</span>}
              {stats.pending > 0 && <span className="badge badge-gray">{stats.pending} pending</span>}
              {stats.done > 0 && <span className="badge badge-green">{stats.done} done</span>}
              {stats.error > 0 && <span className="badge badge-red">{stats.error} error</span>}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {stats.done > 0 && <button onClick={clearDone} className="btn-ghost" style={{ fontSize: 11 }}>Clear done</button>}
              <button
                onClick={handleStartAll}
                disabled={running || stats.pending === 0}
                className="btn-outline"
                style={{ fontSize: 12, padding: "6px 14px" }}
              >
                {running ? "Running…" : `Download all (${stats.pending})`}
              </button>
            </div>
          </div>

          {/* Items */}
          <AnimatePresence initial={false}>
            {batchItems.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <QueueItem item={item} onRemove={() => removeBatchItem(item.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {batchItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.15)" }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto 12px" }}>
            <rect x="4" y="8" width="32" height="6" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="4" y="18" width="22" height="6" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="4" y="28" width="27" height="6" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <p style={{ fontSize: 13 }}>Add URLs above to start a batch download</p>
          <p style={{ fontSize: 11, marginTop: 4, color: "rgba(255,255,255,0.1)" }}>Supports up to {MAX_CONCURRENT} concurrent downloads</p>
        </div>
      )}
    </div>
  );
}

function QueueItem({ item, onRemove }: { item: BatchItem; onRemove: () => void }) {
  const { updateBatchItem } = useStore();
  const color = PLATFORM_COLORS[item.platform as keyof typeof PLATFORM_COLORS] ?? "#888";
  const label = PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? (item.platform ?? "Unknown");

  const statusColor = {
    pending: "rgba(255,255,255,0.3)",
    fetching: "rgba(0,255,255,0.6)",
    downloading: "#00ffff",
    done: "#00ff88",
    error: "rgba(255,80,80,0.8)",
  }[item.status];

  return (
    <div className={`queue-row ${item.status}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Thumbnail or placeholder */}
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" style={{ width: 56, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.04)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.2 }}><rect x="1" y="1" width="12" height="12" rx="2" stroke="white" strokeWidth="1.2"/><path d="M5 4.5l5 2.5-5 2.5z" fill="white"/></svg>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {item.title ? (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.title}</p>
            ) : (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontFamily: "var(--font-mono, monospace)" }}>{item.url}</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, boxShadow: item.status === "downloading" ? `0 0 6px ${statusColor}` : "none" }} />
              <span style={{ fontSize: 10, color: statusColor, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.status}</span>
            </div>
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {item.platform && (
              <span style={{ fontSize: 10, fontWeight: 600, color: color, background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {label}
              </span>
            )}
            {item.format && (
              <select
                value={item.format.format_id}
                onChange={(e) => {
                  // find the format from metadata
                }}
                style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", background: "transparent", border: "none", outline: "none", cursor: "pointer" }}
              >
                <option value={item.format.format_id}>{item.format.label}</option>
              </select>
            )}
            {item.error && <span style={{ fontSize: 11, color: "rgba(255,80,80,0.7)" }}>{item.error}</span>}
          </div>
        </div>

        {/* Remove button */}
        {(item.status === "pending" || item.status === "done" || item.status === "error") && (
          <button onClick={onRemove} style={{ padding: "4px", color: "rgba(255,255,255,0.2)", cursor: "pointer", flexShrink: 0, fontSize: 14, transition: "color 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
          >×</button>
        )}
      </div>

      {/* Progress bar */}
      {item.status === "downloading" && item.progress && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="progress-track" style={{ flex: 1 }}>
            <motion.div
              className="progress-fill"
              animate={{ width: `${item.progress.percent}%` }}
              transition={{ ease: "linear", duration: 0.4 }}
            />
          </div>
          <span className="font-mono-data" style={{ fontSize: 11, color: "rgba(0,255,255,0.5)", flexShrink: 0, minWidth: 40 }}>
            {item.progress.percent.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
