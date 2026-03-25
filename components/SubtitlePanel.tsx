"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const LANGUAGES = [
  "English", "Spanish", "French", "German", "Portuguese", "Italian",
  "Japanese", "Korean", "Chinese (Simplified)", "Arabic", "Russian", "Hindi",
];

export function SubtitlePanel() {
  const { metadata, subtitleSrt, setSubtitleSrt } = useStore();
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState("English");
  const [translated, setTranslated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!metadata) return null;

  async function fetchSubtitles() {
    if (!metadata) return;
    setFetching(true);
    setError(null);
    setSubtitleSrt(null);
    setTranslated(null);
    try {
      const url = useStore.getState().url;
      const res = await fetch(`${API}/api/subtitles/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to fetch subtitles");
      const data = await res.json();
      if (!data.found) {
        setError("No subtitles found for this video.");
        return;
      }
      setSubtitleSrt(data.srt_content);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch subtitles.");
    } finally {
      setFetching(false);
    }
  }

  async function translateSubtitles() {
    if (!subtitleSrt) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/subtitles/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srt_content: subtitleSrt, target_language: targetLang }),
      });
      if (!res.ok) throw new Error("Translation failed");
      const data = await res.json();
      setTranslated(data.translated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Translation failed.");
    } finally {
      setTranslating(false);
    }
  }

  function downloadSrt(content: string, lang: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${metadata?.title ?? "subtitles"}_${lang}.srt`.replace(/[^a-z0-9_.-]/gi, "_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="glass-card"
      style={{ padding: "16px 20px" }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer" }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(0,255,255,0.6)" }}>
          <rect x="1" y="3" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M3.5 6.5h4M3.5 8.5h6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <span className="label-xs" style={{ flex: 1, textAlign: "left" }}>Subtitles & Translation</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "rgba(255,255,255,0.3)" }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Fetch button */}
              {!subtitleSrt && (
                <button
                  onClick={fetchSubtitles}
                  disabled={fetching}
                  className="btn-outline"
                  style={{ alignSelf: "flex-start" }}
                >
                  {fetching ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="dot-loader" style={{ display: "flex", gap: 2 }}><span /><span /><span /></div>
                      Fetching…
                    </span>
                  ) : "Fetch Subtitles"}
                </button>
              )}

              {error && (
                <p style={{ fontSize: 12, color: "rgba(255,80,80,0.8)" }}>{error}</p>
              )}

              {subtitleSrt && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* SRT preview */}
                  <div style={{ position: "relative" }}>
                    <pre style={{
                      fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.7,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 8, padding: 12, maxHeight: 120, overflow: "auto",
                      fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    }}>
                      {subtitleSrt.slice(0, 400)}{subtitleSrt.length > 400 ? "…" : ""}
                    </pre>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-outline" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => downloadSrt(subtitleSrt, "original")}>
                      ↓ Download .srt
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setSubtitleSrt(null); setTranslated(null); setError(null); }}>
                      Clear
                    </button>
                  </div>

                  {/* Translation */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="field-input"
                      style={{ flex: 1, maxWidth: 200, fontSize: 12 }}
                    >
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button
                      className="btn-outline"
                      style={{ fontSize: 12, padding: "6px 12px", flexShrink: 0 }}
                      onClick={translateSubtitles}
                      disabled={translating}
                    >
                      {translating ? "Translating…" : "Translate with AI"}
                    </button>
                  </div>

                  {translated && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <pre style={{
                        fontSize: 11, color: "rgba(0,255,255,0.6)", lineHeight: 1.7,
                        background: "rgba(0,255,255,0.03)", border: "1px solid rgba(0,255,255,0.1)",
                        borderRadius: 8, padding: 12, maxHeight: 120, overflow: "auto",
                        fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap", wordBreak: "break-all",
                      }}>
                        {translated.slice(0, 400)}{translated.length > 400 ? "…" : ""}
                      </pre>
                      <button className="btn-outline" style={{ alignSelf: "flex-start", fontSize: 12, padding: "6px 12px" }} onClick={() => downloadSrt(translated, targetLang)}>
                        ↓ Download {targetLang} .srt
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
