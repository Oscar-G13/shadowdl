"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function DownloadButton() {
  const {
    metadata, selectedFormat, status, saveToDrive, proxy, setProxy,
    setStatus, setProgress, setError, setTaskId, setDriveUrl,
  } = useStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!metadata || !selectedFormat) return null;
  if (["downloading", "uploading", "fetching", "done"].includes(status)) return null;

  async function handleDownload() {
    if (!metadata || !selectedFormat) return;

    setStatus("downloading");
    setProgress(null);
    setError(null);

    try {
      const res = await fetch(`${API}/api/download/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: useStore.getState().url,
          format_id: selectedFormat.format_id,
          quality_label: selectedFormat.label,
          title: metadata.title,
          platform: metadata.platform,
          save_to_drive: saveToDrive,
          proxy: proxy || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to start download.");
      const { task_id } = await res.json();
      setTaskId(task_id);

      const ws = new WebSocket(`${API.replace("http", "ws")}/ws/progress/${task_id}`);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.percent !== undefined) {
          setProgress({ percent: data.percent, speed: data.speed, eta: data.eta });
        }

        if (data.status === "uploading") setStatus("uploading");

        if (data.status === "done") {
          if (data.drive_url) {
            setDriveUrl(data.drive_url);
          } else {
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
          setStatus("done");
          ws.close();
        }

        if (data.status === "error" || data.type === "error") {
          setError(data.message || "Download failed.");
          setStatus("error");
          ws.close();
        }
      };

      ws.onerror = () => {
        setError("Lost connection to the download server.");
        setStatus("error");
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed.");
      setStatus("error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <button
        onClick={handleDownload}
        className="btn-download flex items-center justify-center gap-3"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v10M3 7l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        Download
      </button>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="btn-ghost"
        style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, alignSelf: "center" }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transition: "transform 0.2s", transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)" }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Advanced options
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="glass-card" style={{ padding: "14px 16px" }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 6, letterSpacing: "0.08em" }}>
                PROXY URL (optional)
              </label>
              <input
                className="field-input"
                style={{ fontSize: 12 }}
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                placeholder="http://user:pass@proxy.host:port"
              />
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 5 }}>
                Use a proxy to bypass geo-restrictions or rate limits
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
