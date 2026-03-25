"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Operation {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const OPERATIONS: Operation[] = [
  { id: "compress_social", label: "Compress for Social", description: "720p, ~60% smaller", icon: "⬡" },
  { id: "vertical_crop", label: "Vertical Crop 9:16", description: "TikTok / Reels ready", icon: "◱" },
  { id: "trim", label: "Trim Clip", description: "Set start & end time", icon: "◫" },
  { id: "audio_extract", label: "Extract Audio", description: "Export as MP3 192kbps", icon: "◎" },
  { id: "add_watermark", label: "Add Watermark", description: "Custom text overlay", icon: "◈" },
  { id: "burn_subtitles", label: "Burn Subtitles", description: "Embed .srt into video", icon: "▤" },
];

export function ToolkitView() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ task_id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const srtRef = useRef<HTMLInputElement>(null);

  // Operation-specific options
  const [trimStart, setTrimStart] = useState("0");
  const [trimEnd, setTrimEnd] = useState("60");
  const [watermarkText, setWatermarkText] = useState("ShadowDL");
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [uploadedSrtPath, setUploadedSrtPath] = useState<string | null>(null);

  async function uploadFile(f: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${API}/api/toolkit/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadedPath(data.path);
      setFile(f);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function uploadSrt(f: File) {
    const form = new FormData();
    form.append("file", f);
    try {
      const res = await fetch(`${API}/api/toolkit/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUploadedSrtPath(data.path);
      setSrtFile(f);
    } catch {
      setError("Failed to upload .srt file");
    }
  }

  async function runOperation() {
    if (!uploadedPath || !selectedOp) return;
    setProcessing(true);
    setResult(null);
    setError(null);

    const options: Record<string, string | number> = {};
    if (selectedOp === "trim") { options.start = parseFloat(trimStart) || 0; options.end = parseFloat(trimEnd) || 60; }
    if (selectedOp === "add_watermark") options.text = watermarkText;
    if (selectedOp === "burn_subtitles" && uploadedSrtPath) options.srt_path = uploadedSrtPath;

    try {
      const res = await fetch(`${API}/api/toolkit/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: uploadedPath, operation: selectedOp, options }),
      });
      if (!res.ok) throw new Error("Processing failed");
      const data = await res.json();

      // Poll for completion
      const toolkit_task_id = data.toolkit_task_id;
      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusRes = await fetch(`${API}/api/toolkit/status/${toolkit_task_id}`);
        const status = await statusRes.json();
        if (status.status === "done") {
          setResult({ task_id: toolkit_task_id, url: `${API}/api/toolkit/file/${toolkit_task_id}` });
          break;
        }
        if (status.status === "error") {
          throw new Error(status.error || "Processing failed");
        }
        attempts++;
      }
      if (attempts >= 120) throw new Error("Processing timed out");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setProcessing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) uploadFile(f);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Video Toolkit</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>FFmpeg-powered post-processing for downloaded videos</p>
      </div>

      {/* Upload zone */}
      <div
        className="glass-card"
        style={{ padding: "32px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s", borderStyle: file ? "solid" : "dashed" }}
        onClick={() => !file && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(0,255,255,0.08)", border: "1px solid rgba(0,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ color: "#00ffff" }}><rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M6 8l4 2-4 2z" fill="currentColor"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setFile(null); setUploadedPath(null); setResult(null); setSelectedOp(null); }} className="btn-ghost" style={{ fontSize: 13 }}>×</button>
          </div>
        ) : uploading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div className="dot-loader" style={{ display: "flex", gap: 3 }}><span /><span /><span /></div>
            <span style={{ fontSize: 13, color: "rgba(0,255,255,0.6)" }}>Uploading…</span>
          </div>
        ) : (
          <>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: "rgba(255,255,255,0.3)" }}><path d="M10 3v10M5 8l5-5 5 5M3 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Drop a video file here or click to browse</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>MP4, MOV, MKV, WebM</p>
          </>
        )}
        <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
      </div>

      {/* Operations grid */}
      {file && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <p className="label-xs" style={{ marginBottom: 12 }}>Select Operation</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {OPERATIONS.map((op) => (
              <button
                key={op.id}
                className={`op-card ${selectedOp === op.id ? "selected" : ""}`}
                onClick={() => setSelectedOp(selectedOp === op.id ? null : op.id)}
              >
                <div style={{ fontSize: 18, marginBottom: 6, color: selectedOp === op.id ? "#00ffff" : "rgba(255,255,255,0.4)" }}>{op.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: selectedOp === op.id ? "#00ffff" : "rgba(255,255,255,0.7)", marginBottom: 2 }}>{op.label}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{op.description}</div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Operation-specific options */}
      <AnimatePresence>
        {selectedOp && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <div className="glass-card" style={{ padding: "16px 20px" }}>
              {selectedOp === "trim" && (
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 5 }}>START (seconds)</label>
                    <input className="field-input" type="number" value={trimStart} onChange={(e) => setTrimStart(e.target.value)} placeholder="0" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 5 }}>END (seconds)</label>
                    <input className="field-input" type="number" value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)} placeholder="60" />
                  </div>
                </div>
              )}
              {selectedOp === "add_watermark" && (
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 5 }}>WATERMARK TEXT</label>
                  <input className="field-input" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="Your text here" />
                </div>
              )}
              {selectedOp === "burn_subtitles" && (
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 5 }}>SUBTITLE FILE (.srt)</label>
                  {srtFile ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "rgba(0,255,255,0.7)" }}>{srtFile.name}</span>
                      <button onClick={() => { setSrtFile(null); setUploadedSrtPath(null); }} className="btn-ghost" style={{ fontSize: 12 }}>×</button>
                    </div>
                  ) : (
                    <button className="btn-outline" style={{ fontSize: 12 }} onClick={() => srtRef.current?.click()}>
                      Upload .srt
                    </button>
                  )}
                  <input ref={srtRef} type="file" accept=".srt,.vtt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSrt(f); }} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Process button */}
      {selectedOp && uploadedPath && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <button
            onClick={runOperation}
            disabled={processing || (selectedOp === "burn_subtitles" && !uploadedSrtPath)}
            className="btn-download"
            style={{ maxWidth: 240 }}
          >
            {processing ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div className="dot-loader" style={{ display: "flex", gap: 3 }}><span /><span /><span /></div>
                Processing…
              </span>
            ) : `Run: ${OPERATIONS.find((o) => o.id === selectedOp)?.label}`}
          </button>
        </motion.div>
      )}

      {error && <p style={{ fontSize: 12, color: "rgba(255,80,80,0.8)" }}>{error}</p>}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: "20px 24px", borderColor: "rgba(0,255,136,0.2)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#00ff88" }}><path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: "rgba(0,255,136,0.9)", fontWeight: 500 }}>Processing complete</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Your file is ready to download</p>
              </div>
              <a href={result.url} download className="btn-outline" style={{ fontSize: 12, textDecoration: "none" }}>
                ↓ Download
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
