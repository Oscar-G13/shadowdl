"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function DownloadButton() {
  const { metadata, selectedFormat, status, saveToDrive, setStatus, setProgress, setError, setTaskId, setDriveUrl } = useStore();

  if (!metadata || metadata.type !== "single" || !selectedFormat) return null;
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
    >
      <button onClick={handleDownload} className="btn-download flex items-center justify-center gap-3">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v10M3 7l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        Download
      </button>
    </motion.div>
  );
}
