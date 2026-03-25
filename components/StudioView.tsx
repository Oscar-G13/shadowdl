"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Segment { id: number; start: number; end: number; text: string; }
interface TextOverlay { id: string; text: string; start: number; end: number; x: string; y: string; fontsize: number; color: string; }
interface VideoEdits {
  trim_start: number; trim_end: number | null;
  speed: number; color_filter: string | null;
  brightness: number; contrast: number; saturation: number;
  volume: number; audio_fade_in: number; audio_fade_out: number;
  flip_h: boolean; flip_v: boolean; rotate: number;
  text_overlays: TextOverlay[];
}

const DEFAULT_EDITS: VideoEdits = {
  trim_start: 0, trim_end: null,
  speed: 1.0, color_filter: null,
  brightness: 0, contrast: 1.0, saturation: 1.0,
  volume: 1.0, audio_fade_in: 0, audio_fade_out: 0,
  flip_h: false, flip_v: false, rotate: 0,
  text_overlays: [],
};

type StudioMode = "subtitles" | "editor" | "magic";

// ── Top-level component ─────────────────────────────────────────────────────

export function StudioView() {
  const [file, setFile] = useState<File | null>(null);
  const [serverPath, setServerPath] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<StudioMode>("subtitles");
  const fileRef = useRef<HTMLInputElement>(null);

  // Export shared state
  const [exportTaskId, setExportTaskId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportExt, setExportExt] = useState("mp4");

  async function handleFile(f: File) {
    const src = URL.createObjectURL(f);
    setVideoSrc(src);
    setFile(f);
    setServerPath(null);
    setExportTaskId(null); setExportStatus(null); setExportUrl(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${API}/api/toolkit/upload`, { method: "POST", body: form });
      const data = await res.json();
      setServerPath(data.path);
    } catch {
      // silent — server path just won't be set
    } finally {
      setUploading(false);
    }
  }

  async function pollExport(taskId: string) {
    setExporting(true);
    let attempts = 0;
    while (attempts < 180) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const res = await fetch(`${API}/api/studio/status/${taskId}`);
        const data = await res.json();
        const step = data.step ? ` — ${data.step.replace(/_/g, " ")}` : "";
        setExportStatus(`${data.status}${step}`);
        if (data.status === "done") {
          setExportUrl(`${API}/api/studio/file/${taskId}`);
          setExportExt(data.ext || "mp4");
          setExporting(false);
          return;
        }
        if (data.status === "error") {
          setExportStatus(`Error: ${data.error || "unknown"}`);
          setExporting(false);
          return;
        }
      } catch { /* keep polling */ }
      attempts++;
    }
    setExportStatus("Timed out");
    setExporting(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  const MODES: { id: StudioMode; label: string; icon: string }[] = [
    { id: "subtitles", label: "Subtitles", icon: "▤" },
    { id: "editor", label: "Editor", icon: "◧" },
    { id: "magic", label: "Magic", icon: "✦" },
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#00ffff", textShadow: "0 0 12px rgba(0,255,255,0.6)" }}>Shadow</span> Studio
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
            AI captions · timeline editor · one-click magic exports
          </p>
        </div>
      </div>

      {/* File upload zone */}
      {!file ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card"
          style={{ padding: "48px 32px", textAlign: "center", cursor: "pointer", borderStyle: "dashed" }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(0,255,255,0.06)", border: "1px solid rgba(0,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: "rgba(0,255,255,0.7)" }}>
              <path d="M4 15.5V17a1 1 0 001 1h12a1 1 0 001-1v-1.5M11 4v9M7.5 9l3.5-4 3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Drop a video file here or click to open</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>MP4 · MOV · MKV · WebM · AVI</p>
          <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* File info bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,255,255,0.08)", border: "1px solid rgba(0,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#00ffff" }}><rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 4.5l5 2.5-5 2.5z" fill="currentColor"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB
                {uploading && <span style={{ marginLeft: 8, color: "rgba(0,255,255,0.5)" }}>↑ uploading…</span>}
                {serverPath && !uploading && <span style={{ marginLeft: 8, color: "rgba(0,255,136,0.6)" }}>✓ ready</span>}
              </p>
            </div>
            <button onClick={() => { setFile(null); setVideoSrc(null); setServerPath(null); setExportUrl(null); }} className="btn-ghost" style={{ fontSize: 13 }}>× Close</button>
          </div>

          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {MODES.map((m) => (
              <button key={m.id} className={`studio-tab ${mode === m.id ? "active" : ""}`} onClick={() => setMode(m.id)}>
                <span style={{ marginRight: 5 }}>{m.icon}</span>{m.label}
              </button>
            ))}
          </div>

          {/* Mode content */}
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {mode === "subtitles" && (
                <SubtitleMaker
                  videoSrc={videoSrc!}
                  serverPath={serverPath}
                  duration={duration}
                  onDuration={setDuration}
                  onExport={(taskId) => { setExportTaskId(taskId); pollExport(taskId); }}
                />
              )}
              {mode === "editor" && (
                <VideoEditor
                  videoSrc={videoSrc!}
                  serverPath={serverPath}
                  duration={duration}
                  onDuration={setDuration}
                  onExport={(taskId) => { setExportTaskId(taskId); pollExport(taskId); }}
                />
              )}
              {mode === "magic" && (
                <MagicMode
                  serverPath={serverPath}
                  onExport={(taskId) => { setExportTaskId(taskId); pollExport(taskId); }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Export status */}
          <AnimatePresence>
            {(exporting || exportUrl) && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="glass-card"
                style={{ padding: "16px 20px", borderColor: exportUrl ? "rgba(0,255,136,0.2)" : "rgba(0,255,255,0.15)" }}
              >
                {exporting ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="spin" style={{ color: "#00ffff" }}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="20 15"/></svg>
                    <span style={{ fontSize: 13, color: "rgba(0,255,255,0.8)" }}>
                      {exportStatus?.replace(/_/g, " ") ?? "Processing…"}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "#00ff88" }}><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: "rgba(0,255,136,0.9)", fontWeight: 500 }}>Export complete</p>
                      {exportStatus?.startsWith("Error") && <p style={{ fontSize: 11, color: "rgba(255,80,80,0.8)", marginTop: 2 }}>{exportStatus}</p>}
                    </div>
                    {exportUrl && (
                      <a href={exportUrl} download className="btn-outline" style={{ fontSize: 12, textDecoration: "none" }}>
                        ↓ Download .{exportExt}
                      </a>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}


// ── Subtitle Maker ──────────────────────────────────────────────────────────

function SubtitleMaker({ videoSrc, serverPath, duration, onDuration, onExport }: {
  videoSrc: string; serverPath: string | null;
  duration: number; onDuration: (d: number) => void;
  onExport: (taskId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState("default");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState<string | null>(null);

  const dur = duration || 1;
  const PX_PER_SEC = Math.max(60, Math.min(120, (800 / dur)));

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setCurrentTime(v.currentTime);
    v.addEventListener("timeupdate", update);
    v.addEventListener("loadedmetadata", () => onDuration(v.duration));
    return () => { v.removeEventListener("timeupdate", update); };
  }, [onDuration]);

  async function handleTranscribe() {
    if (!serverPath) return;
    setTranscribing(true);
    setTranscribeStatus("Starting transcription…");
    try {
      const res = await fetch(`${API}/api/studio/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: serverPath }),
      });
      const { task_id } = await res.json();

      // Poll
      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 1500));
        const sRes = await fetch(`${API}/api/studio/transcribe-status/${task_id}`);
        const sData = await sRes.json();
        setTranscribeStatus(sData.status === "transcribing" ? "Transcribing with Whisper…" : sData.status.replace(/_/g, " "));
        if (sData.status === "done") {
          setSegments(sData.segments || []);
          setTranscribeStatus(null);
          break;
        }
        if (sData.status === "error") {
          setTranscribeStatus(`Error: ${sData.error}`);
          break;
        }
        attempts++;
      }
    } catch {
      setTranscribeStatus("Request failed");
    } finally {
      setTranscribing(false);
    }
  }

  function seekTo(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = x / PX_PER_SEC;
    seekTo(Math.min(Math.max(t, 0), dur));
  }

  function updateSegment(id: number, field: keyof Segment, value: string | number) {
    setSegments((segs) => segs.map((s) => s.id === id ? { ...s, [field]: field === "text" ? value : Number(value) } : s));
  }

  function splitSegment(id: number) {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    const mid = (seg.start + seg.end) / 2;
    const maxId = Math.max(...segments.map((s) => s.id));
    setSegments((segs) => {
      const updated = segs.map((s) => s.id === id ? { ...s, end: mid } : s);
      const idx = updated.findIndex((s) => s.id === id);
      updated.splice(idx + 1, 0, { id: maxId + 1, start: mid, end: seg.end, text: seg.text });
      return updated;
    });
  }

  function deleteSegment(id: number) {
    setSegments((segs) => segs.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function handleBurn() {
    if (!serverPath || segments.length === 0) return;
    const res = await fetch(`${API}/api/studio/burn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: serverPath, segments, style: subtitleStyle }),
    });
    const { task_id } = await res.json();
    onExport(task_id);
  }

  function downloadSrt() {
    const content = segments.map((s, i) => {
      const fmt = (sec: number) => {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), sv = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sv).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
      };
      return `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text}`;
    }).join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "subtitles.srt";
    a.click();
  }

  const selected = segments.find((s) => s.id === selectedId);
  const STYLE_OPTS = [
    { id: "default", label: "Default" },
    { id: "tiktok", label: "TikTok" },
    { id: "bold", label: "Bold" },
    { id: "minimal", label: "Minimal" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Video + segment list side by side on wide screens */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, alignItems: "start" }}>
        {/* Left: video + timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 280, objectFit: "contain" }}
          />

          {/* Timeline */}
          <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "10px 12px" }}>
            <p className="label-xs" style={{ marginBottom: 8 }}>Timeline</p>
            <div
              ref={timelineRef}
              style={{ overflowX: "auto", paddingBottom: 4 }}
            >
              <div
                className="sub-timeline"
                style={{ width: Math.max(400, dur * PX_PER_SEC), position: "relative", cursor: "pointer" }}
                onClick={handleTimelineClick}
              >
                {/* Playhead */}
                <div className="playhead" style={{ left: currentTime * PX_PER_SEC }} />
                {/* Segments */}
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className={`sub-block ${selectedId === seg.id ? "selected" : ""}`}
                    style={{
                      left: seg.start * PX_PER_SEC,
                      width: Math.max(20, (seg.end - seg.start) * PX_PER_SEC - 2),
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(seg.id); seekTo(seg.start); }}
                  >
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis" }}>{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
            {dur > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span className="font-mono-data" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>0:00</span>
                <span className="font-mono-data" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, "0")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: segment list + editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Generate button */}
          {segments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <button
                onClick={handleTranscribe}
                disabled={transcribing || !serverPath}
                className="btn-download"
                style={{ width: "100%", padding: "14px", fontSize: 13 }}
              >
                {transcribing ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="spin"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="18 12"/></svg>
                    {transcribeStatus ?? "Transcribing…"}
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5a5 5 0 100 10 5 5 0 000-10zM6.5 4v4M4.5 6.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    Generate with Whisper
                  </span>
                )}
              </button>
              {!serverPath && <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 6 }}>Upload still in progress…</p>}
            </div>
          ) : (
            <>
              {/* Segment list */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <span className="label-xs">{segments.length} segments</span>
                <button onClick={() => setSegments([])} className="btn-ghost" style={{ fontSize: 10 }}>Clear</button>
              </div>
              <div className="scroll-area" style={{ maxHeight: 200, display: "flex", flexDirection: "column", gap: 3 }}>
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    onClick={() => { setSelectedId(seg.id); seekTo(seg.start); }}
                    style={{
                      padding: "7px 10px", borderRadius: 7, cursor: "pointer", transition: "background 0.12s",
                      background: selectedId === seg.id ? "rgba(0,255,255,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${selectedId === seg.id ? "rgba(0,255,255,0.25)" : "rgba(255,255,255,0.05)"}`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 2 }}>
                      <span className="font-mono-data" style={{ fontSize: 9, color: "rgba(0,255,255,0.5)", flexShrink: 0 }}>
                        {seg.start.toFixed(1)}s→{seg.end.toFixed(1)}s
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{seg.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Selected segment editor */}
          {selected && (
            <div style={{ padding: "12px", background: "rgba(0,255,255,0.04)", border: "1px solid rgba(0,255,255,0.15)", borderRadius: 10 }}>
              <p className="label-xs" style={{ marginBottom: 8 }}>Edit Segment</p>
              <textarea
                className="field-textarea"
                style={{ minHeight: 60, fontSize: 12 }}
                value={selected.text}
                onChange={(e) => updateSegment(selected.id, "text", e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 3 }}>START</label>
                  <input className="field-input" style={{ fontSize: 11, padding: "5px 8px" }} type="number" step="0.1"
                    value={selected.start} onChange={(e) => updateSegment(selected.id, "start", e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 3 }}>END</label>
                  <input className="field-input" style={{ fontSize: 11, padding: "5px 8px" }} type="number" step="0.1"
                    value={selected.end} onChange={(e) => updateSegment(selected.id, "end", e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => splitSegment(selected.id)} className="btn-ghost" style={{ fontSize: 10, flex: 1, padding: "5px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>Split</button>
                <button onClick={() => deleteSegment(selected.id)} className="btn-ghost" style={{ fontSize: 10, flex: 1, padding: "5px 0", border: "1px solid rgba(255,60,60,0.2)", borderRadius: 6, color: "rgba(255,80,80,0.6)" }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Style + export controls */}
      {segments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
          {/* Style picker */}
          <div>
            <p className="label-xs" style={{ marginBottom: 8 }}>Caption Style</p>
            <div style={{ display: "flex", gap: 6 }}>
              {STYLE_OPTS.map((s) => (
                <button key={s.id} className={`sub-style-btn ${subtitleStyle === s.id ? "active" : ""}`} onClick={() => setSubtitleStyle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={downloadSrt} className="btn-outline" style={{ fontSize: 12 }}>↓ Export .srt</button>
            <button onClick={handleBurn} disabled={!serverPath} className="btn-download" style={{ flex: 1, maxWidth: 200, padding: "12px" }}>
              Burn into Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Video Editor ──────────────────────────────────────────────────────────

function VideoEditor({ videoSrc, serverPath, duration, onDuration, onExport }: {
  videoSrc: string; serverPath: string | null;
  duration: number; onDuration: (d: number) => void;
  onExport: (taskId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trimTrackRef = useRef<HTMLDivElement>(null);
  const [edits, setEdits] = useState<VideoEdits>({ ...DEFAULT_EDITS });
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [newOverlay, setNewOverlay] = useState({ text: "", start: "0", end: "5" });
  const [showOverlayForm, setShowOverlayForm] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener("loadedmetadata", () => {
      onDuration(v.duration);
      setTrimEnd(v.duration);
      setEdits((e) => ({ ...e, trim_end: v.duration }));
    });
  }, [onDuration]);

  const dur = duration || 1;
  const trimStart = edits.trim_start;
  const effectiveTrimEnd = trimEnd ?? dur;

  function setEdit<K extends keyof VideoEdits>(key: K, value: VideoEdits[K]) {
    setEdits((e) => ({ ...e, [key]: value }));
  }

  // Trim drag handlers
  function handleTrimMouseDown(handle: "start" | "end") {
    setDragging(handle);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging || !trimTrackRef.current) return;
      const rect = trimTrackRef.current.getBoundingClientRect();
      const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      const t = pct * dur;
      if (dragging === "start") {
        const newStart = Math.min(t, effectiveTrimEnd - 0.5);
        setEdit("trim_start", Math.max(0, newStart));
      } else {
        const newEnd = Math.max(t, trimStart + 0.5);
        setTrimEnd(Math.min(dur, newEnd));
        setEdit("trim_end", Math.min(dur, newEnd));
      }
    }
    function onUp() { setDragging(null); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, dur, trimStart, effectiveTrimEnd]);

  function addOverlay() {
    if (!newOverlay.text.trim()) return;
    const overlay: TextOverlay = {
      id: Date.now().toString(),
      text: newOverlay.text,
      start: parseFloat(newOverlay.start) || 0,
      end: parseFloat(newOverlay.end) || 5,
      x: "(w-text_w)/2", y: "h-th-60",
      fontsize: 28, color: "white",
    };
    setEdit("text_overlays", [...edits.text_overlays, overlay]);
    setNewOverlay({ text: "", start: "0", end: "5" });
    setShowOverlayForm(false);
  }

  async function handleExport() {
    if (!serverPath) return;
    const res = await fetch(`${API}/api/studio/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: serverPath, edits: { ...edits, trim_end: effectiveTrimEnd } }),
    });
    const { task_id } = await res.json();
    onExport(task_id);
  }

  const SPEEDS = [0.5, 0.75, 1.0, 1.5, 2.0];
  const FILTERS = [
    { id: null, label: "None" },
    { id: "vintage", label: "Vintage" },
    { id: "bw", label: "B&W" },
    { id: "vivid", label: "Vivid" },
    { id: "cool", label: "Cool" },
    { id: "warm", label: "Warm" },
    { id: "fade", label: "Fade" },
    { id: "cinema", label: "Cinema" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Video preview */}
      <video ref={videoRef} src={videoSrc} controls style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 10, background: "#000" }} />

      {/* Trim track */}
      <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p className="label-xs">Trim</p>
          <div style={{ display: "flex", gap: 10 }}>
            <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              {trimStart.toFixed(1)}s → {effectiveTrimEnd.toFixed(1)}s
            </span>
            <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(0,255,255,0.5)" }}>
              ({(effectiveTrimEnd - trimStart).toFixed(1)}s)
            </span>
          </div>
        </div>
        <div ref={trimTrackRef} className="trim-track" style={{ userSelect: "none" }}>
          <div className="trim-fill" style={{ left: `${(trimStart / dur) * 100}%`, right: `${(1 - effectiveTrimEnd / dur) * 100}%` }} />
          <div className="trim-handle" style={{ left: `calc(${(trimStart / dur) * 100}% - 5px)` }} onMouseDown={() => handleTrimMouseDown("start")} />
          <div className="trim-handle" style={{ left: `calc(${(effectiveTrimEnd / dur) * 100}% - 5px)` }} onMouseDown={() => handleTrimMouseDown("end")} />
        </div>
      </div>

      {/* Controls grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Speed */}
        <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
          <p className="label-xs" style={{ marginBottom: 10 }}>Speed</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {SPEEDS.map((s) => (
              <button key={s} className={`speed-btn ${edits.speed === s ? "active" : ""}`} onClick={() => setEdit("speed", s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Rotation / flip */}
        <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
          <p className="label-xs" style={{ marginBottom: 10 }}>Transform</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[0, 90, 180, 270].map((r) => (
              <button key={r} className={`speed-btn ${edits.rotate === r ? "active" : ""}`} onClick={() => setEdit("rotate", r)}>
                {r}°
              </button>
            ))}
            <button className={`speed-btn ${edits.flip_h ? "active" : ""}`} onClick={() => setEdit("flip_h", !edits.flip_h)}>↔</button>
            <button className={`speed-btn ${edits.flip_v ? "active" : ""}`} onClick={() => setEdit("flip_v", !edits.flip_v)}>↕</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
        <p className="label-xs" style={{ marginBottom: 10 }}>Color Filter</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={String(f.id)} className={`filter-pill ${edits.color_filter === f.id ? "active" : ""}`} onClick={() => setEdit("color_filter", f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Adjustments */}
      <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
        <p className="label-xs" style={{ marginBottom: 12 }}>Adjustments</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {[
            { key: "brightness" as const, label: "Brightness", min: -0.5, max: 0.5, step: 0.05, def: 0 },
            { key: "contrast" as const, label: "Contrast", min: 0.5, max: 2.0, step: 0.05, def: 1.0 },
            { key: "saturation" as const, label: "Saturation", min: 0, max: 2.0, step: 0.05, def: 1.0 },
            { key: "volume" as const, label: "Volume", min: 0, max: 2.0, step: 0.05, def: 1.0 },
            { key: "audio_fade_in" as const, label: "Fade In", min: 0, max: 5, step: 0.5, def: 0 },
            { key: "audio_fade_out" as const, label: "Fade Out", min: 0, max: 5, step: 0.5, def: 0 },
          ].map(({ key, label, min, max, step, def }) => (
            <div key={key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{label}</label>
                <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(0,255,255,0.6)" }}>{(edits[key] as number).toFixed(2)}</span>
              </div>
              <input
                type="range" className="studio-slider"
                min={min} max={max} step={step}
                value={edits[key] as number}
                onChange={(e) => setEdit(key, parseFloat(e.target.value))}
              />
            </div>
          ))}
        </div>
        <button onClick={() => setEdits({ ...DEFAULT_EDITS, trim_start: edits.trim_start, trim_end: edits.trim_end })} className="btn-ghost" style={{ fontSize: 10, marginTop: 10 }}>Reset adjustments</button>
      </div>

      {/* Text overlays */}
      <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p className="label-xs">Text Overlays</p>
          <button onClick={() => setShowOverlayForm(!showOverlayForm)} className="btn-ghost" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Add
          </button>
        </div>
        {showOverlayForm && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <input className="field-input" style={{ flex: 2, fontSize: 12 }} value={newOverlay.text} onChange={(e) => setNewOverlay({ ...newOverlay, text: e.target.value })} placeholder="Text content" />
            <input className="field-input" style={{ width: 60, fontSize: 12 }} type="number" value={newOverlay.start} onChange={(e) => setNewOverlay({ ...newOverlay, start: e.target.value })} placeholder="Start" />
            <input className="field-input" style={{ width: 60, fontSize: 12 }} type="number" value={newOverlay.end} onChange={(e) => setNewOverlay({ ...newOverlay, end: e.target.value })} placeholder="End" />
            <button onClick={addOverlay} className="btn-outline" style={{ fontSize: 12, flexShrink: 0 }}>Add</button>
          </div>
        )}
        {edits.text_overlays.length === 0 ? (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>No text overlays</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {edits.text_overlays.map((ov) => (
              <div key={ov.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 }}>{ov.text}</span>
                <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{ov.start}s–{ov.end}s</span>
                <button onClick={() => setEdit("text_overlays", edits.text_overlays.filter((o) => o.id !== ov.id))} className="btn-ghost" style={{ fontSize: 12 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <button onClick={handleExport} disabled={!serverPath} className="btn-download" style={{ padding: "16px" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 8 }}><path d="M7 1v8M3 6l4 4 4-4M1 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Export Edited Video
      </button>
    </div>
  );
}


// ── Magic Mode ────────────────────────────────────────────────────────────

function MagicMode({ serverPath, onExport }: { serverPath: string | null; onExport: (taskId: string) => void }) {
  const [running, setRunning] = useState<string | null>(null);

  async function runMagic(preset: string) {
    if (!serverPath) return;
    setRunning(preset);
    try {
      const res = await fetch(`${API}/api/studio/magic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: serverPath, preset }),
      });
      const { task_id } = await res.json();
      onExport(task_id);
    } finally {
      setRunning(null);
    }
  }

  const PRESETS = [
    {
      id: "viral_tiktok",
      emoji: "🔥",
      label: "Viral TikTok Edit",
      description: "Vertical 9:16 crop → trim to 60s → auto-captions burned in TikTok style",
      color: "#ff2d55",
    },
    {
      id: "youtube_short",
      emoji: "📱",
      label: "YouTube Short",
      description: "Vertical 9:16 crop → trim to 60s → clean white captions",
      color: "#ff0000",
    },
    {
      id: "podcast_clean",
      emoji: "🎙",
      label: "Podcast Clean",
      description: "Strip video → 192kbps MP3 audio + transcript .srt exported",
      color: "#00ffff",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
        One-click presets that chain crop → trim → Whisper captions → export automatically.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="magic-card"
            onClick={() => runMagic(p.id)}
            disabled={!serverPath || !!running}
            style={{ opacity: running && running !== p.id ? 0.5 : 1, borderColor: running === p.id ? p.color + "50" : undefined }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{p.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: running === p.id ? p.color : "rgba(255,255,255,0.85)", marginBottom: 6 }}>
              {p.label}
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
              {p.description}
            </p>
            {running === p.id && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="spin" style={{ color: p.color }}><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" strokeDasharray="14 10"/></svg>
                <span style={{ fontSize: 10, color: p.color }}>Processing…</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {!serverPath && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          File upload in progress — magic presets will unlock shortly
        </p>
      )}

      <div style={{ padding: "14px 16px", background: "rgba(8,8,8,0.9)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10 }}>
        <p className="label-xs" style={{ marginBottom: 8 }}>What magic does</p>
        <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            ["🎬", "Chains multiple FFmpeg operations in one pass"],
            ["🤖", "Whisper AI transcribes and timestamps captions automatically"],
            ["⚡", "Optimized for TikTok, Reels, YouTube Shorts spec compliance"],
            ["💾", "Output saved to your device — no cloud involved"],
          ].map(([icon, text]) => (
            <li key={String(text)} style={{ display: "flex", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              <span>{icon}</span>
              <span>{String(text)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
