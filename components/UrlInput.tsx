"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function UrlInput() {
  const { setUrl, setMetadata, setSelectedFormat, setStatus, setError, reset } = useStore();
  const [localUrl, setLocalUrl] = useState("");

  async function submitUrl(target: string) {
    const trimmed = target.trim();
    if (!trimmed) return;

    reset();
    setUrl(trimmed);
    setStatus("fetching");
    setError(null);

    try {
      const res = await fetch(`${API}/api/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to fetch video info.");
      }

      const meta = await res.json();
      setMetadata(meta);
      if (meta.formats?.length) setSelectedFormat(meta.formats[0]);
      setStatus("ready");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") submitUrl(localUrl);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").trim();
    setLocalUrl(pasted);
    setTimeout(() => submitUrl(pasted), 50);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-2xl mx-auto"
    >
      <div className="input-shell flex items-center" style={{ padding: "6px 6px 6px 24px" }}>
        {/* Subtle left indicator */}
        <div
          className="shrink-0 w-1.5 h-1.5 rounded-full mr-4"
          style={{ background: "#00ffff", boxShadow: "0 0 8px #00ffff", animation: "glow-pulse 2s ease-in-out infinite" }}
        />

        <input
          type="text"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder="Paste a video URL…"
          autoFocus
          className="flex-1 bg-transparent text-white outline-none font-light"
          style={{
            fontSize: "16px",
            letterSpacing: "0.01em",
            caretColor: "#00ffff",
          }}
        />

        {/* Placeholder styled separately via CSS — input has its own */}
        <button
          onClick={() => submitUrl(localUrl)}
          disabled={!localUrl.trim()}
          style={{
            background: localUrl.trim() ? "#00ffff" : "rgba(255,255,255,0.06)",
            color: localUrl.trim() ? "#000" : "rgba(255,255,255,0.2)",
            border: "none",
            borderRadius: "10px",
            padding: "12px 22px",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: localUrl.trim() ? "pointer" : "not-allowed",
            transition: "all 0.2s ease",
            boxShadow: localUrl.trim() ? "0 0 16px rgba(0,255,255,0.3)" : "none",
            flexShrink: 0,
          }}
        >
          Go
        </button>
      </div>

      {/* Subtle hint */}
      <p
        className="text-center mt-3"
        style={{ fontSize: "12px", color: "rgba(255,255,255,0.18)", letterSpacing: "0.04em" }}
      >
        Supports YouTube · TikTok · Instagram · Facebook · Reddit · X
      </p>
    </motion.div>
  );
}
