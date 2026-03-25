"use client";

import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function DownloadButton() {
  const {
    metadata, selectedFormat, status, saveToDrive,
    setStatus, setProgress, setError, setTaskId, setDriveUrl, reset,
  } = useStore();

  if (!metadata || !selectedFormat) return null;
  if (status === "downloading" || status === "uploading" || status === "fetching") return null;
  if (status === "done") return null;

  async function handleDownload() {
    if (!metadata || !selectedFormat) return;

    setStatus("downloading");
    setProgress(null);
    setError(null);

    try {
      // Kick off the download task
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

      // Open WebSocket to track progress
      const ws = new WebSocket(`${API.replace("http", "ws")}/ws/progress/${task_id}`);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "progress" || data.percent !== undefined) {
          setProgress({ percent: data.percent, speed: data.speed, eta: data.eta });
        }

        if (data.status === "uploading") {
          setStatus("uploading");
        }

        if (data.status === "done") {
          if (data.drive_url) {
            setDriveUrl(data.drive_url);
            setStatus("done");
          } else {
            // Trigger native browser download
            const a = document.createElement("a");
            a.href = `${API}/api/download/file/${task_id}`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Clean up server-side temp file after a delay
            setTimeout(() => {
              fetch(`${API}/api/download/file/${task_id}`, { method: "DELETE" }).catch(() => {});
            }, 5000);

            setStatus("done");
          }
          ws.close();
        }

        if (data.status === "error" || data.type === "error") {
          setError(data.message || "Download failed.");
          setStatus("error");
          ws.close();
        }
      };

      ws.onerror = () => {
        setError("Connection to download server lost.");
        setStatus("error");
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed.");
      setStatus("error");
    }
  }

  return (
    <button
      onClick={handleDownload}
      className="neon-btn-filled w-full max-w-3xl mx-auto block py-4 rounded-xl text-base font-bold tracking-wide"
    >
      Download
    </button>
  );
}
