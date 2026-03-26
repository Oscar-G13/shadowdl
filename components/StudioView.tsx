"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_BASE = API.replace("http://", "ws://").replace("https://", "wss://");

// ─── Filter Library ────────────────────────────────────────────────────────────

interface FilterDef { id: string; label: string; css: string; }

const FILTERS: FilterDef[] = [
  { id: "none",        label: "Original",  css: "" },
  { id: "greyscale",   label: "B&W",       css: "grayscale(1)" },
  { id: "noir",        label: "Noir",      css: "grayscale(1) contrast(1.5) brightness(0.85)" },
  { id: "sepia",       label: "Sepia",     css: "sepia(0.9)" },
  { id: "cinematic",   label: "Cinema",    css: "contrast(1.2) saturate(0.75) brightness(0.92)" },
  { id: "vivid",       label: "Vivid",     css: "saturate(1.8) contrast(1.1)" },
  { id: "neon",        label: "Neon",      css: "hue-rotate(90deg) saturate(2) brightness(1.1)" },
  { id: "warm",        label: "Warm",      css: "sepia(0.3) saturate(1.2) brightness(1.05)" },
  { id: "cool",        label: "Cool",      css: "hue-rotate(-20deg) saturate(1.1) brightness(1.05)" },
  { id: "fade",        label: "Fade",      css: "contrast(0.85) saturate(0.7) brightness(1.1)" },
  { id: "golden",      label: "Golden",    css: "sepia(0.5) saturate(1.5) brightness(1.1)" },
  { id: "night",       label: "Night",     css: "brightness(0.6) contrast(1.4) saturate(0.5)" },
  { id: "summer",      label: "Summer",    css: "brightness(1.1) saturate(1.5) hue-rotate(10deg)" },
  { id: "drama",       label: "Drama",     css: "contrast(1.5) brightness(0.9) saturate(1.2)" },
  { id: "soft",        label: "Soft",      css: "contrast(0.9) saturate(0.85) brightness(1.05)" },
  { id: "glitch",      label: "Glitch",    css: "hue-rotate(180deg) saturate(3) contrast(1.5)" },
  { id: "vhs",         label: "VHS",       css: "contrast(1.1) saturate(1.3) hue-rotate(-10deg)" },
  { id: "teal_orange", label: "Teal+Org",  css: "sepia(0.2) hue-rotate(-20deg) saturate(1.5)" },
  { id: "matte",       label: "Matte",     css: "contrast(0.8) brightness(1.15) saturate(0.6)" },
  { id: "pop",         label: "Pop Art",   css: "saturate(3) contrast(1.3)" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Segment   { id: number; start: number; end: number; text: string; }
interface TextOverlay { id: string; text: string; start: number; end: number; fontsize: number; color: string; }
interface VersionEntry {
  id: string; label: string; timestamp: string;
  filter: string; speed: number; trimStart: number; trimEnd: number | null;
  brightness: number; contrast: number; saturation: number; segments: Segment[];
}
interface AISuggestions {
  viral_moments?: { start: number; end: number; reason: string }[];
  recommended_trim?: { start: number; end: number; reason: string };
  recommended_platform?: string;
  caption_style?: string;
  hook?: string;
  error?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function srtTs(s: number): string {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  const ms = Math.floor((s % 1) * 1000).toString().padStart(3, "0");
  return `${h}:${m}:${sec},${ms}`;
}

function buildCSSFilter(filterId: string, b: number, c: number, sat: number): string {
  const parts: string[] = [];
  const preset = FILTERS.find((f) => f.id === filterId);
  if (preset?.css) parts.push(preset.css);
  parts.push(`brightness(${b.toFixed(2)}) contrast(${c.toFixed(2)}) saturate(${sat.toFixed(2)})`);
  return parts.join(" ");
}

async function drawWaveform(file: File, canvas: HTMLCanvasElement) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx2 = new AC() as AudioContext;
    const buf = await file.arrayBuffer();
    const audio = await ctx2.decodeAudioData(buf);
    ctx2.close();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const data = audio.getChannelData(0);
    const step = Math.ceil(data.length / w);
    const amp = h / 2;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < w; i++) {
      let mn = 1, mx = -1;
      for (let j = i * step; j < Math.min((i + 1) * step, data.length); j++) {
        if (data[j] < mn) mn = data[j];
        if (data[j] > mx) mx = data[j];
      }
      const y1 = Math.round(amp + mn * amp * 0.88);
      const y2 = Math.round(amp + mx * amp * 0.88);
      ctx.fillStyle = "rgba(0,255,255,0.45)";
      ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }
  } catch { /* non-critical */ }
}

// ─── StudioView ────────────────────────────────────────────────────────────────

export function StudioView() {
  const [file, setFile]               = useState<File | null>(null);
  const [videoUrl, setVideoUrl]       = useState("");
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOver, setDragOver]       = useState(false);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);

  const [duration, setDuration]       = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);

  // Edit state
  const [filter, setFilter]           = useState("none");
  const [speed, setSpeed]             = useState(1);
  const [trimStart, setTrimStart]     = useState(0);
  const [trimEnd, setTrimEnd]         = useState<number | null>(null);
  const [brightness, setBrightness]   = useState(1);
  const [contrast, setContrast]       = useState(1);
  const [saturation, setSaturation]   = useState(1);
  const [volume, setVolume]           = useState(1);
  const [audioFadeIn, setAudioFadeIn] = useState(0);
  const [audioFadeOut, setAudioFadeOut] = useState(0);
  const [crop, setCrop]               = useState("none");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);

  // Subtitles
  const [segments, setSegments]               = useState<Segment[]>([]);
  const [subtitleStyle, setSubtitleStyle]     = useState("default");
  const [transcribeStatus, setTranscribeStatus] = useState<"idle"|"extracting"|"transcribing"|"done"|"error">("idle");
  const [transcribeError, setTranscribeError] = useState("");

  // AI
  const [aiStatus, setAiStatus]       = useState<"idle"|"analyzing"|"done"|"error">("idle");
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);

  // Bake
  const [bakeStatus, setBakeStatus]   = useState<"idle"|"baking"|"done"|"error">("idle");
  const [bakePercent, setBakePercent] = useState(0);
  const [bakeStep, setBakeStep]       = useState("");
  const [bakedUrl, setBakedUrl]       = useState<string | null>(null);
  const [bakeElapsed, setBakeElapsed] = useState(0);
  const bakeStartRef   = useRef(0);
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Versions & tabs
  const [versions, setVersions]       = useState<VersionEntry[]>([]);
  const [activeTab, setActiveTab]     = useState<"editor"|"subtitles"|"magic"|"export"|"history">("editor");

  // ── File handling ───────────────────────────────────────────────────────────

  async function handleFile(f: File) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setUploadedPath(null);
    setBakedUrl(null);
    setBakeStatus("idle");
    setSegments([]);
    setSuggestions(null);
    setAiStatus("idle");
    setTranscribeStatus("idle");
    setTranscribeError("");
    setTrimStart(0);
    setTrimEnd(null);
    setFilter("none");
    setBrightness(1); setContrast(1); setSaturation(1); setVolume(1); setSpeed(1);
    uploadFile(f);
  }

  async function uploadFile(f: File) {
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res  = await fetch(`${API}/api/toolkit/upload`, { method: "POST", body: form });
      const data = await res.json();
      setUploadedPath(data.path);
    } catch { /* retry on bake */ } finally { setUploadingFile(false); }
  }

  // ── Instant preview ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (videoRef.current)
      videoRef.current.style.filter = buildCSSFilter(filter, brightness, contrast, saturation);
  }, [filter, brightness, contrast, saturation]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [volume]);

  // ── Video events ────────────────────────────────────────────────────────────

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta  = () => { setDuration(v.duration); setTrimEnd(v.duration); if (file && waveformRef.current) drawWaveform(file, waveformRef.current); };
    const onTime  = () => { setCurrentTime(v.currentTime); const te = trimEnd; if (te !== null && v.currentTime >= te) { v.pause(); v.currentTime = te; } };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd   = () => setIsPlaying(false);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    return () => { v.removeEventListener("loadedmetadata", onMeta); v.removeEventListener("timeupdate", onTime); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); v.removeEventListener("ended", onEnd); };
  }, [file, trimEnd]);

  // ── Timeline drag ───────────────────────────────────────────────────────────

  function seekClick(e: React.MouseEvent<HTMLDivElement>) {
    const tl = timelineRef.current;
    if (!tl || duration === 0) return;
    const rect = tl.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function startTrimDrag(e: React.MouseEvent, handle: "start" | "end") {
    e.preventDefault(); e.stopPropagation();
    const tl = timelineRef.current;
    if (!tl || duration === 0) return;
    const rect = tl.getBoundingClientRect();
    const onMove = (me: MouseEvent) => {
      const t = Math.max(0, Math.min(duration, ((me.clientX - rect.left) / rect.width) * duration));
      if (handle === "start") { setTrimStart(Math.min(t, (trimEnd ?? duration) - 0.5)); if (videoRef.current) videoRef.current.currentTime = t; }
      else { setTrimEnd(Math.max(t, trimStart + 0.5)); if (videoRef.current) videoRef.current.currentTime = t; }
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Transcription ───────────────────────────────────────────────────────────

  async function transcribeVideo() {
    if (!uploadedPath) { setTranscribeError("File still uploading..."); return; }
    setTranscribeStatus("extracting"); setTranscribeError("");
    try {
      const { task_id } = await fetch(`${API}/api/studio/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_path: uploadedPath }) }).then(r => r.json());
      while (true) {
        await new Promise(r => setTimeout(r, 1200));
        const s = await fetch(`${API}/api/studio/transcribe-status/${task_id}`).then(r => r.json());
        if (s.status === "transcribing") setTranscribeStatus("transcribing");
        if (s.status === "done") { setSegments(s.segments || []); setTranscribeStatus("done"); break; }
        if (s.status === "error") { setTranscribeError(s.error || "Failed"); setTranscribeStatus("error"); break; }
      }
    } catch { setTranscribeError("Network error"); setTranscribeStatus("error"); }
  }

  // ── AI suggest ──────────────────────────────────────────────────────────────

  async function analyzeVideo() {
    setAiStatus("analyzing"); setSuggestions(null);
    try {
      const { task_id } = await fetch(`${API}/api/studio/suggest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata: { title: file?.name, duration }, segments }) }).then(r => r.json());
      while (true) {
        await new Promise(r => setTimeout(r, 1000));
        const s = await fetch(`${API}/api/studio/status/${task_id}`).then(r => r.json());
        if (s.status === "done") { setSuggestions(s.suggestions || {}); setAiStatus("done"); break; }
        if (s.status === "error") { setAiStatus("error"); break; }
      }
    } catch { setAiStatus("error"); }
  }

  function applyAISuggestions() {
    if (!suggestions) return;
    if (suggestions.recommended_trim) { setTrimStart(suggestions.recommended_trim.start); setTrimEnd(suggestions.recommended_trim.end); if (videoRef.current) videoRef.current.currentTime = suggestions.recommended_trim.start; }
    if (suggestions.caption_style) setSubtitleStyle(suggestions.caption_style);
    saveVersion("AI Applied");
    setActiveTab("editor");
  }

  // ── Bake ────────────────────────────────────────────────────────────────────

  async function bake(preset?: string) {
    if (!uploadedPath) return;
    setBakeStatus("baking"); setBakePercent(0); setBakeStep("starting"); setBakedUrl(null);
    bakeStartRef.current = Date.now(); setBakeElapsed(0);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => setBakeElapsed(Math.floor((Date.now() - bakeStartRef.current) / 1000)), 1000);

    try {
      let taskId: string;
      if (preset) {
        const r = await fetch(`${API}/api/studio/magic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_path: uploadedPath, preset }) });
        taskId = (await r.json()).task_id;
      } else {
        const r = await fetch(`${API}/api/studio/export`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_path: uploadedPath, edits: { filter, speed, trim_start: trimStart, trim_end: trimEnd, crop: crop !== "none" ? crop : undefined, brightness, contrast, saturation, volume, audio_fade_in: audioFadeIn, audio_fade_out: audioFadeOut, text_overlays: textOverlays, segments: segments.length > 0 ? segments : undefined, subtitle_style: subtitleStyle } }),
        });
        taskId = (await r.json()).task_id;
      }

      const ws = new WebSocket(`${WS_BASE}/ws/studio/${taskId}`);
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        setBakePercent(d.percent || 0);
        setBakeStep(d.step || d.status || "");
        if (d.status === "done") { clearInterval(elapsedTimer.current!); setBakeStatus("done"); setBakePercent(100); setBakedUrl(`${API}/api/studio/file/${taskId}`); ws.close(); saveVersion("Baked"); }
        if (d.status === "error") { clearInterval(elapsedTimer.current!); setBakeStatus("error"); ws.close(); }
      };
      ws.onerror = () => pollBake(taskId);
    } catch { clearInterval(elapsedTimer.current!); setBakeStatus("error"); }
  }

  async function pollBake(taskId: string) {
    while (true) {
      await new Promise(r => setTimeout(r, 500));
      const s = await fetch(`${API}/api/studio/status/${taskId}`).then(r => r.json()).catch(() => null);
      if (!s) break;
      setBakePercent(s.percent || 0); setBakeStep(s.step || s.status || "");
      if (s.status === "done") { clearInterval(elapsedTimer.current!); setBakeStatus("done"); setBakePercent(100); setBakedUrl(`${API}/api/studio/file/${taskId}`); saveVersion("Baked"); break; }
      if (s.status === "error") { clearInterval(elapsedTimer.current!); setBakeStatus("error"); break; }
    }
  }

  // ── Version history ─────────────────────────────────────────────────────────

  function saveVersion(label: string) {
    setVersions(prev => [{ id: crypto.randomUUID(), label, timestamp: new Date().toLocaleTimeString(), filter, speed, trimStart, trimEnd, brightness, contrast, saturation, segments: [...segments] }, ...prev.slice(0, 19)]);
  }

  function restoreVersion(v: VersionEntry) {
    setFilter(v.filter); setSpeed(v.speed); setTrimStart(v.trimStart); setTrimEnd(v.trimEnd);
    setBrightness(v.brightness); setContrast(v.contrast); setSaturation(v.saturation); setSegments(v.segments);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!file) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "56px 24px" }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith("video/")) handleFile(f); }}
          onClick={() => document.getElementById("studio-file-input")?.click()}
          style={{ border: `2px dashed ${dragOver ? "#00ffff" : "rgba(255,255,255,0.1)"}`, borderRadius: 16, padding: "64px 32px", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(0,255,255,0.04)" : "rgba(255,255,255,0.02)", transition: "all 0.2s", boxShadow: dragOver ? "0 0 40px rgba(0,255,255,0.1) inset" : "none" }}
        >
          <div style={{ fontSize: 52, marginBottom: 16, opacity: dragOver ? 1 : 0.4 }}>🎬</div>
          <p style={{ fontSize: 17, fontWeight: 600, color: dragOver ? "#00ffff" : "rgba(255,255,255,0.6)", marginBottom: 8 }}>Drop your video here</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>MP4 · MOV · MKV · WebM — instant live preview</p>
          <p style={{ fontSize: 11, color: "rgba(0,255,255,0.35)", marginTop: 8 }}>Filters apply instantly in preview. No render needed until you Bake.</p>
        </div>
        <input id="studio-file-input" type="file" accept="video/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
    );
  }

  const trimEndSafe = trimEnd ?? duration;
  const playPct  = duration > 0 ? (currentTime / duration) * 100 : 0;
  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct   = duration > 0 ? (trimEndSafe / duration) * 100 : 100;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => { URL.revokeObjectURL(videoUrl); setFile(null); setVideoUrl(""); }} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>← New File</button>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{file.name}</span>
        {uploadingFile && <span style={{ fontSize: 10, color: "rgba(0,255,255,0.5)", display: "flex", alignItems: "center", gap: 5 }}><span className="spin" style={{ width: 8, height: 8, border: "1.5px solid rgba(0,255,255,0.3)", borderTopColor: "#00ffff", borderRadius: "50%", display: "inline-block" }} />Uploading...</span>}
        {uploadedPath && !uploadingFile && <span style={{ fontSize: 10, color: "rgba(0,255,100,0.5)" }}>✓ Ready</span>}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => saveVersion("Manual save")} className="btn-ghost" style={{ fontSize: 11 }}>Save Version</button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 370px", gap: 14, alignItems: "start" }}>

        {/* Left: Player + Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Video */}
          <div style={{ position: "relative", background: "#000", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", aspectRatio: "16/9" }}>
            <video ref={videoRef} src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} onDoubleClick={() => videoRef.current?.requestFullscreen()} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 14px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))", display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", fontSize: 12, flexShrink: 0 }}>{isPlaying ? "⏸" : "▶"}</button>
              <span className="font-mono-data" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>{fmt(currentTime)} / {fmt(duration)}</span>
              <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.12)", borderRadius: 1, cursor: "pointer" }}
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); if (videoRef.current) videoRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration; }}>
                <div style={{ height: "100%", width: `${playPct}%`, background: "#00ffff", borderRadius: 1, pointerEvents: "none" }} />
              </div>
              {speed !== 1 && <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(0,255,255,0.6)", flexShrink: 0 }}>{speed}x</span>}
              {filter !== "none" && <span style={{ fontSize: 9, color: "rgba(0,255,255,0.5)", flexShrink: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>{filter}</span>}
            </div>
          </div>

          {/* Waveform + Trim */}
          <div ref={timelineRef} onClick={seekClick} style={{ position: "relative", height: 58, background: "rgba(0,0,0,0.4)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", cursor: "crosshair" }}>
            <canvas ref={waveformRef} width={700} height={58} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: 0, width: `${startPct}%`, height: "100%", background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: `${endPct}%`, right: 0, height: "100%", background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: `${startPct}%`, width: `${endPct - startPct}%`, height: "100%", border: "1px solid rgba(0,255,255,0.3)", boxSizing: "border-box", background: "rgba(0,255,255,0.04)", pointerEvents: "none" }} />
            {(["start", "end"] as const).map(side => {
              const pct = side === "start" ? startPct : endPct;
              const label = side === "start" ? fmt(trimStart) : fmt(trimEndSafe);
              return (
                <div key={side} onMouseDown={e => startTrimDrag(e, side)} style={{ position: "absolute", top: 0, left: `${pct}%`, width: 8, height: "100%", transform: "translateX(-50%)", cursor: "ew-resize", background: "rgba(0,255,255,0.9)", zIndex: 4, borderRadius: side === "start" ? "3px 0 0 3px" : "0 3px 3px 0" }}>
                  <span style={{ position: "absolute", bottom: "calc(100% + 3px)", left: "50%", transform: "translateX(-50%)", fontSize: 8, color: "#00ffff", whiteSpace: "nowrap", fontFamily: "monospace", pointerEvents: "none" }}>{label}</span>
                </div>
              );
            })}
            {activeTab === "subtitles" && segments.map(seg => {
              const l = duration > 0 ? (seg.start / duration) * 100 : 0;
              const w = duration > 0 ? ((seg.end - seg.start) / duration) * 100 : 0;
              return <div key={seg.id} title={seg.text} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = seg.start; }} style={{ position: "absolute", top: "65%", left: `${l}%`, width: `${Math.max(w, 0.4)}%`, height: "28%", background: "rgba(0,255,255,0.65)", borderRadius: 2, cursor: "pointer", zIndex: 2 }} />;
            })}
            <div style={{ position: "absolute", top: 0, left: `${playPct}%`, width: 2, height: "100%", background: "rgba(255,255,255,0.9)", transform: "translateX(-50%)", zIndex: 5, pointerEvents: "none" }} />
          </div>

          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", display: "flex", gap: 14 }}>
            <span>Clip: {fmt(trimStart)} → {fmt(trimEndSafe)} ({fmt(trimEndSafe - trimStart)})</span>
            {segments.length > 0 && <span>{segments.length} subtitle segments</span>}
          </div>
        </div>

        {/* Right: Tabs + Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3 }}>
            {(["editor","subtitles","magic","export","history"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "6px 3px", borderRadius: 6, cursor: "pointer", transition: "all 0.15s", background: activeTab === tab ? "rgba(0,255,255,0.12)" : "transparent", color: activeTab === tab ? "#00ffff" : "rgba(255,255,255,0.28)", border: activeTab === tab ? "1px solid rgba(0,255,255,0.25)" : "1px solid transparent" }}>
                {tab === "history" ? "Log" : tab === "subtitles" ? "Subs" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.13 }}>
              {activeTab === "editor" && <EditorPanel filter={filter} setFilter={setFilter} speed={speed} setSpeed={setSpeed} brightness={brightness} setBrightness={setBrightness} contrast={contrast} setContrast={setContrast} saturation={saturation} setSaturation={setSaturation} volume={volume} setVolume={setVolume} audioFadeIn={audioFadeIn} setAudioFadeIn={setAudioFadeIn} audioFadeOut={audioFadeOut} setAudioFadeOut={setAudioFadeOut} crop={crop} setCrop={setCrop} textOverlays={textOverlays} setTextOverlays={setTextOverlays} duration={duration} />}
              {activeTab === "subtitles" && <SubtitlePanel segments={segments} setSegments={setSegments} subtitleStyle={subtitleStyle} setSubtitleStyle={setSubtitleStyle} status={transcribeStatus} error={transcribeError} onTranscribe={transcribeVideo} canTranscribe={!!uploadedPath && !uploadingFile} uploadingFile={uploadingFile} onSeek={(t: number) => { if (videoRef.current) videoRef.current.currentTime = t; }} />}
              {activeTab === "magic" && <MagicPanel status={aiStatus} suggestions={suggestions} onAnalyze={analyzeVideo} onApplyAll={applyAISuggestions} hasFile={!!uploadedPath} hasTranscript={segments.length > 0} onSeek={(t: number) => { if (videoRef.current) videoRef.current.currentTime = t; }} />}
              {activeTab === "export" && <ExportPanel bakeStatus={bakeStatus} bakePercent={bakePercent} bakeStep={bakeStep} bakeElapsed={bakeElapsed} bakedUrl={bakedUrl} onBake={bake} canBake={!!uploadedPath && !uploadingFile && bakeStatus !== "baking"} uploadingFile={uploadingFile} />}
              {activeTab === "history" && <VersionHistoryPanel versions={versions} onRestore={restoreVersion} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Editor Panel ──────────────────────────────────────────────────────────────

function EditorPanel({ filter, setFilter, speed, setSpeed, brightness, setBrightness, contrast, setContrast, saturation, setSaturation, volume, setVolume, audioFadeIn, setAudioFadeIn, audioFadeOut, setAudioFadeOut, crop, setCrop, textOverlays, setTextOverlays, duration }: any) {
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const CROPS  = [{ id: "none", label: "Free" }, { id: "16:9", label: "16:9" }, { id: "9:16", label: "9:16" }, { id: "1:1", label: "1:1" }];
  const sliders = [
    { label: "Brightness", val: brightness, set: setBrightness, min: 0.2, max: 2.0, def: 1 },
    { label: "Contrast",   val: contrast,   set: setContrast,   min: 0.5, max: 2.5, def: 1 },
    { label: "Saturation", val: saturation, set: setSaturation, min: 0,   max: 3.0, def: 1 },
    { label: "Volume",     val: volume,     set: setVolume,     min: 0,   max: 2.0, def: 1 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Filter grid */}
      <div className="glass-card" style={{ padding: "12px 14px" }}>
        <p className="label-xs" style={{ marginBottom: 10 }}>Filters — Live Preview</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "6px 3px", borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: "pointer", transition: "all 0.1s", textAlign: "center", letterSpacing: "0.04em", background: filter === f.id ? "rgba(0,255,255,0.15)" : "rgba(255,255,255,0.04)", color: filter === f.id ? "#00ffff" : "rgba(255,255,255,0.5)", border: filter === f.id ? "1px solid rgba(0,255,255,0.4)" : "1px solid rgba(255,255,255,0.06)" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div className="glass-card" style={{ padding: "12px 14px" }}>
        <p className="label-xs" style={{ marginBottom: 8 }}>Speed — Instant</p>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{ padding: "5px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.1s", background: speed === s ? "rgba(0,255,255,0.15)" : "rgba(255,255,255,0.04)", color: speed === s ? "#00ffff" : "rgba(255,255,255,0.4)", border: speed === s ? "1px solid rgba(0,255,255,0.35)" : "1px solid rgba(255,255,255,0.06)" }}>
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="glass-card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="label-xs">Adjustments — Live</p>
        {sliders.map(({ label, val, set, min, max, def }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", width: 72, flexShrink: 0 }}>{label}</span>
            <input type="range" min={min} max={max} step={0.05} value={val} onChange={e => set(parseFloat(e.target.value))} className="studio-slider" style={{ flex: 1 }} />
            <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", width: 30, textAlign: "right" }}>{val.toFixed(2)}</span>
            <button onClick={() => set(def)} title="Reset" style={{ fontSize: 9, padding: "2px 5px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, cursor: "pointer", color: "rgba(255,255,255,0.25)" }}>↺</button>
          </div>
        ))}
      </div>

      {/* Fades + Crop */}
      <div className="glass-card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="label-xs">Audio Fades & Crop</p>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ label: "Fade In (s)", val: audioFadeIn, set: setAudioFadeIn }, { label: "Fade Out (s)", val: audioFadeOut, set: setAudioFadeOut }].map(({ label, val, set }) => (
            <div key={label} style={{ flex: 1 }}>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>{label}</p>
              <input type="number" min="0" max="10" step="0.1" value={val} onChange={e => set(parseFloat(e.target.value) || 0)} className="field-input" style={{ width: "100%", fontSize: 11 }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {CROPS.map(c => (
            <button key={c.id} onClick={() => setCrop(c.id)} style={{ flex: 1, padding: "5px 4px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", background: crop === c.id ? "rgba(0,255,255,0.15)" : "rgba(255,255,255,0.04)", color: crop === c.id ? "#00ffff" : "rgba(255,255,255,0.4)", border: crop === c.id ? "1px solid rgba(0,255,255,0.35)" : "1px solid rgba(255,255,255,0.06)" }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <TextOverlayEditor textOverlays={textOverlays} setTextOverlays={setTextOverlays} duration={duration} />
    </div>
  );
}

// ─── Text Overlay Editor ───────────────────────────────────────────────────────

function TextOverlayEditor({ textOverlays, setTextOverlays, duration }: any) {
  const add = () => setTextOverlays((p: TextOverlay[]) => [...p, { id: crypto.randomUUID(), text: "Your text", start: 0, end: Math.min(5, duration), fontsize: 28, color: "white" }]);
  const upd = (id: string, k: string, v: any) => setTextOverlays((p: TextOverlay[]) => p.map(o => o.id === id ? { ...o, [k]: v } : o));
  const del = (id: string) => setTextOverlays((p: TextOverlay[]) => p.filter(o => o.id !== id));

  return (
    <div className="glass-card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="label-xs">Text Overlays</p>
        <button onClick={add} className="btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }}>+ Add</button>
      </div>
      {textOverlays.map((ov: TextOverlay) => (
        <div key={ov.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 5 }}>
            <input value={ov.text} onChange={e => upd(ov.id, "text", e.target.value)} className="field-input" style={{ flex: 1, fontSize: 11 }} placeholder="Text..." />
            <button onClick={() => del(ov.id)} style={{ fontSize: 13, padding: "0 7px", background: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.2)", borderRadius: 5, cursor: "pointer", color: "rgba(255,100,100,0.8)" }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
            <span>Start</span>
            <input type="number" min="0" max={duration} step="0.1" value={ov.start} onChange={e => upd(ov.id, "start", parseFloat(e.target.value))} className="field-input" style={{ width: 55, fontSize: 10 }} />
            <span>End</span>
            <input type="number" min="0" max={duration} step="0.1" value={ov.end} onChange={e => upd(ov.id, "end", parseFloat(e.target.value))} className="field-input" style={{ width: 55, fontSize: 10 }} />
            <span>Size</span>
            <input type="number" min="12" max="72" value={ov.fontsize} onChange={e => upd(ov.id, "fontsize", parseInt(e.target.value))} className="field-input" style={{ width: 45, fontSize: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Subtitle Panel ────────────────────────────────────────────────────────────

const SUB_STYLES = [
  { id: "default", label: "Clean"   },
  { id: "tiktok",  label: "TikTok"  },
  { id: "bold",    label: "Bold"    },
  { id: "minimal", label: "Minimal" },
];

function SubtitlePanel({ segments, setSegments, subtitleStyle, setSubtitleStyle, status, error, onTranscribe, canTranscribe, uploadingFile, onSeek }: any) {
  const updSeg = (id: number, text: string) => setSegments((p: Segment[]) => p.map((s: Segment) => s.id === id ? { ...s, text } : s));
  const delSeg = (id: number) => setSegments((p: Segment[]) => p.filter((s: Segment) => s.id !== id));

  function dlSRT() {
    const lines = segments.map((s: Segment, i: number) => `${i+1}\n${srtTs(s.start)} --> ${srtTs(s.end)}\n${s.text}\n`).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([lines], { type: "text/plain" })), download: "subtitles.srt" });
    a.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(status === "idle" || status === "error") && (
        <button onClick={onTranscribe} disabled={!canTranscribe} className="btn-primary" style={{ width: "100%", padding: "10px", fontSize: 12, fontWeight: 600, opacity: !canTranscribe ? 0.5 : 1 }}>
          {uploadingFile ? "Uploading..." : !canTranscribe ? "Processing..." : "🎙  Transcribe with Whisper AI"}
        </button>
      )}
      {(status === "extracting" || status === "transcribing") && (
        <div style={{ textAlign: "center", padding: "16px", background: "rgba(0,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(0,255,255,0.12)" }}>
          <div className="dot-loader" style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 8 }}><span /><span /><span /></div>
          <p style={{ fontSize: 12, color: "rgba(0,255,255,0.7)" }}>{status === "extracting" ? "Extracting audio..." : "Transcribing with Whisper..."}</p>
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: "rgba(255,100,100,0.8)", padding: "7px 10px", background: "rgba(255,0,0,0.06)", borderRadius: 6 }}>{error}</p>}
      {segments.length > 0 && (
        <>
          <div className="glass-card" style={{ padding: "10px 12px" }}>
            <p className="label-xs" style={{ marginBottom: 8 }}>Caption Style</p>
            <div style={{ display: "flex", gap: 5 }}>
              {SUB_STYLES.map(s => (
                <button key={s.id} onClick={() => setSubtitleStyle(s.id)} style={{ flex: 1, padding: "5px 3px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", background: subtitleStyle === s.id ? "rgba(0,255,255,0.15)" : "rgba(255,255,255,0.04)", color: subtitleStyle === s.id ? "#00ffff" : "rgba(255,255,255,0.4)", border: subtitleStyle === s.id ? "1px solid rgba(0,255,255,0.35)" : "1px solid rgba(255,255,255,0.06)" }}>
                  {s.label}
                </button>
              ))}
            </div>
            <button onClick={dlSRT} className="btn-ghost" style={{ marginTop: 8, fontSize: 10, width: "100%" }}>↓ Download SRT</button>
          </div>
          <div className="glass-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
              <span className="label-xs">{segments.length} Segments</span>
              <button onClick={() => setSegments([])} style={{ fontSize: 10, color: "rgba(255,100,100,0.5)", background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
            </div>
            <div className="scroll-area" style={{ maxHeight: 280 }}>
              {segments.map((seg: Segment) => (
                <div key={seg.id} style={{ padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <button onClick={() => onSeek(seg.start)} style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(0,255,255,0.6)", background: "rgba(0,255,255,0.06)", border: "1px solid rgba(0,255,255,0.15)", borderRadius: 3, padding: "2px 4px", cursor: "pointer", flexShrink: 0, lineHeight: 1.5 }}>{fmt(seg.start)}</button>
                  <textarea value={seg.text} onChange={e => updSeg(seg.id, e.target.value)} style={{ flex: 1, background: "transparent", border: "none", color: "rgba(255,255,255,0.72)", fontSize: 11, resize: "none", fontFamily: "inherit", lineHeight: 1.4, minHeight: 32 }} rows={2} />
                  <button onClick={() => delSeg(seg.id)} style={{ fontSize: 13, color: "rgba(255,100,100,0.45)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Magic Panel ───────────────────────────────────────────────────────────────

function MagicPanel({ status, suggestions, onAnalyze, onApplyAll, hasFile, hasTranscript, onSeek }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ padding: "14px", background: "rgba(0,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(0,255,255,0.12)" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#00ffff", marginBottom: 4 }}>✨ AI Magic Suggest</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, marginBottom: 10 }}>GPT-4o analyzes your video to find viral moments, best trim, caption style, and platform fit.</p>
        <button onClick={onAnalyze} disabled={!hasFile || status === "analyzing"} className="btn-primary" style={{ width: "100%", padding: "9px", fontSize: 12, fontWeight: 600, opacity: (!hasFile || status === "analyzing") ? 0.5 : 1 }}>
          {status === "analyzing" ? "Analyzing..." : "Analyze My Video"}
        </button>
        {!hasTranscript && hasFile && <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: 6, textAlign: "center" }}>Tip: Transcribe first for better results</p>}
      </div>
      {status === "analyzing" && (
        <div style={{ textAlign: "center", padding: "18px" }}>
          <div className="dot-loader" style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 6 }}><span /><span /><span /></div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>AI is reading your video...</p>
        </div>
      )}
      {suggestions && !suggestions.error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.hook && (
            <div className="glass-card" style={{ padding: "10px 12px" }}>
              <p className="label-xs" style={{ marginBottom: 5 }}>Hook</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, fontStyle: "italic" }}>"{suggestions.hook}"</p>
            </div>
          )}
          {suggestions.recommended_trim && (
            <div className="glass-card" style={{ padding: "10px 12px" }}>
              <p className="label-xs" style={{ marginBottom: 5 }}>Best Trim</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span className="font-mono-data" style={{ fontSize: 12, color: "#00ffff" }}>{fmt(suggestions.recommended_trim.start)} → {fmt(suggestions.recommended_trim.end)}</span>
                <button onClick={() => onSeek(suggestions.recommended_trim.start)} className="btn-ghost" style={{ fontSize: 9, padding: "2px 5px" }}>▶</button>
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{suggestions.recommended_trim.reason}</p>
            </div>
          )}
          {suggestions.viral_moments && suggestions.viral_moments.length > 0 && (
            <div className="glass-card" style={{ padding: "10px 12px" }}>
              <p className="label-xs" style={{ marginBottom: 8 }}>Viral Moments</p>
              {suggestions.viral_moments.slice(0, 3).map((m: any, i: number) => (
                <div key={i} style={{ marginBottom: 7, paddingBottom: 7, borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span className="font-mono-data" style={{ fontSize: 11, color: "#00ffff" }}>{fmt(m.start)} → {fmt(m.end)}</span>
                    <button onClick={() => onSeek(m.start)} className="btn-ghost" style={{ fontSize: 9, padding: "1px 4px" }}>▶</button>
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{m.reason}</p>
                </div>
              ))}
            </div>
          )}
          {(suggestions.recommended_platform || suggestions.caption_style) && (
            <div className="glass-card" style={{ padding: "10px 12px", display: "flex", gap: 12 }}>
              {suggestions.recommended_platform && <div style={{ flex: 1 }}><p style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginBottom: 3 }}>Platform</p><span style={{ fontSize: 12, fontWeight: 700, color: "#00ffff", textTransform: "capitalize" }}>{suggestions.recommended_platform.replace(/_/g, " ")}</span></div>}
              {suggestions.caption_style && <div style={{ flex: 1 }}><p style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginBottom: 3 }}>Caption</p><span style={{ fontSize: 12, fontWeight: 700, color: "#00ffff", textTransform: "capitalize" }}>{suggestions.caption_style}</span></div>}
            </div>
          )}
          <button onClick={onApplyAll} className="btn-primary" style={{ width: "100%", padding: "9px", fontSize: 12, fontWeight: 600 }}>Apply All Suggestions</button>
        </div>
      )}
      {suggestions?.error && <p style={{ fontSize: 11, color: "rgba(255,100,100,0.8)", padding: "8px 12px", background: "rgba(255,0,0,0.06)", borderRadius: 7 }}>AI analysis failed. Try again.</p>}
    </div>
  );
}

// ─── Export Panel ──────────────────────────────────────────────────────────────

const EXPORT_PRESETS = [
  { id: "viral_tiktok",  label: "TikTok Ready",   desc: "9:16 · 60s · Bold captions",  color: "#ff0050" },
  { id: "youtube_short", label: "YouTube Short",   desc: "9:16 · 60s · Clean captions", color: "#ff4444" },
  { id: "podcast_clean", label: "Podcast Clean",   desc: "192kbps MP3 · SRT sidecar",   color: "#9b59b6" },
  { id: "custom",        label: "Custom Bake",     desc: "Use your editor settings",    color: "#00ffff" },
];

const STEP_MAP: Record<string, string> = {
  processing: "Processing...", editing: "Applying edits...", transcribing: "Transcribing audio...",
  burning_subtitles: "Burning subtitles...", extracting_audio: "Extracting audio...",
  analyzing: "Analyzing...", starting: "Starting...", done: "Done!",
};

function ExportPanel({ bakeStatus, bakePercent, bakeStep, bakeElapsed, bakedUrl, onBake, canBake, uploadingFile }: any) {
  const eta = bakePercent > 5 && bakeElapsed > 0 ? Math.round((bakeElapsed / bakePercent) * (100 - bakePercent)) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="glass-card" style={{ padding: "12px 14px" }}>
        <p className="label-xs" style={{ marginBottom: 10 }}>Export Presets</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {EXPORT_PRESETS.map(p => (
            <button key={p.id} onClick={() => onBake(p.id === "custom" ? undefined : p.id)} disabled={!canBake || bakeStatus === "baking"}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${p.color}20`, cursor: (!canBake || bakeStatus === "baking") ? "not-allowed" : "pointer", opacity: (!canBake || bakeStatus === "baking") ? 0.4 : 1, transition: "all 0.15s", textAlign: "left" }}
              onMouseEnter={e => { if (canBake) (e.currentTarget as HTMLButtonElement).style.background = `${p.color}0d`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: p.color, marginBottom: 1 }}>{p.label}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
        {uploadingFile && <p style={{ fontSize: 10, color: "rgba(0,255,255,0.45)", marginTop: 8, textAlign: "center" }}>Uploading file to server...</p>}
      </div>

      {bakeStatus === "baking" && (
        <div style={{ padding: "14px", background: "rgba(0,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(0,255,255,0.15)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#00ffff", marginBottom: 8 }}>Baking your masterpiece...</p>
          <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
            <motion.div animate={{ width: `${bakePercent}%` }} transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ height: "100%", background: "linear-gradient(90deg, #00ffff, #0088ff)", borderRadius: 99, boxShadow: "0 0 8px rgba(0,255,255,0.4)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{STEP_MAP[bakeStep] || bakeStep || "Processing..."}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{bakeElapsed}s</span>
              {eta !== null && <span className="font-mono-data" style={{ fontSize: 10, color: "rgba(0,255,255,0.5)" }}>~{eta}s left</span>}
              <span className="font-mono-data" style={{ fontSize: 14, fontWeight: 700, color: "#00ffff" }}>{bakePercent}%</span>
            </div>
          </div>
        </div>
      )}

      {bakeStatus === "done" && bakedUrl && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          style={{ padding: "14px", background: "rgba(0,255,100,0.05)", borderRadius: 10, border: "1px solid rgba(0,255,100,0.2)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#00ff88", marginBottom: 10 }}>✓ Bake complete!</p>
          <a href={bakedUrl} download style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", background: "rgba(0,255,100,0.1)", border: "1px solid rgba(0,255,100,0.25)", borderRadius: 8, color: "#00ff88", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            ↓ Download Baked Video
          </a>
        </motion.div>
      )}

      {bakeStatus === "error" && <p style={{ fontSize: 11, color: "rgba(255,100,100,0.8)", padding: "10px 12px", background: "rgba(255,0,0,0.06)", borderRadius: 8 }}>Bake failed. Check the file is valid and try again.</p>}
    </div>
  );
}

// ─── Version History ───────────────────────────────────────────────────────────

function VersionHistoryPanel({ versions, onRestore }: { versions: VersionEntry[]; onRestore: (v: VersionEntry) => void }) {
  if (versions.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,0.2)" }}>
        <p style={{ fontSize: 13 }}>No saved versions yet.</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>Click "Save Version" to create a checkpoint.</p>
      </div>
    );
  }
  return (
    <div className="glass-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="label-xs">{versions.length} Saved Versions</p>
      </div>
      <div className="scroll-area" style={{ maxHeight: 420 }}>
        {versions.map((v, i) => (
          <div key={v.id} onClick={() => onRestore(v)}
            style={{ padding: "9px 12px", borderBottom: i < versions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", transition: "background 0.12s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 2 }}>{v.label}</p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", display: "flex", gap: 8 }}>
                <span>{v.timestamp}</span><span>{v.filter}</span><span>{v.speed}x</span>
                <span>{fmt(v.trimStart)}→{v.trimEnd ? fmt(v.trimEnd) : "end"}</span>
              </p>
            </div>
            <button className="btn-ghost" style={{ fontSize: 9, padding: "2px 7px", flexShrink: 0 }}>Restore</button>
          </div>
        ))}
      </div>
    </div>
  );
}
