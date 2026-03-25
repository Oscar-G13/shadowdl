"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function UrlInput() {
  const { url, setUrl, setMetadata, setSelectedFormat, setStatus, setError, reset } = useStore();
  const [localUrl, setLocalUrl] = useState("");

  async function handleSubmit() {
    const trimmed = localUrl.trim();
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
    if (e.key === "Enter") handleSubmit();
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text");
    setLocalUrl(pasted);
    // Auto-submit after a short delay so the input renders first
    setTimeout(() => {
      handleSubmit();
    }, 100);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-3xl mx-auto"
    >
      <div className="neon-border rounded-xl overflow-hidden flex items-center bg-[#080808]">
        <input
          type="text"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder="Paste video URL here…"
          className="flex-1 bg-transparent text-white text-lg px-6 py-5 outline-none placeholder:text-white/20 font-light"
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!localUrl.trim()}
          className="neon-btn-filled mr-3 px-6 py-3 rounded-lg text-sm font-semibold disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
        >
          Fetch
        </button>
      </div>
    </motion.div>
  );
}
