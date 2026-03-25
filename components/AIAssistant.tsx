"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const INTENTS = [
  { label: "Best for editing", icon: "✦" },
  { label: "TikTok repost", icon: "◈" },
  { label: "Archive quality", icon: "▣" },
  { label: "Mobile viewing", icon: "◉" },
  { label: "Smallest file", icon: "◫" },
  { label: "Audio only", icon: "◎" },
];

export function AIAssistant() {
  const { metadata, setSelectedFormat, aiRecommendation, setAiRecommendation, aiLoading, setAiLoading } = useStore();
  const [activeIntent, setActiveIntent] = useState<string | null>(null);

  if (!metadata?.formats?.length) return null;

  async function handleIntent(intent: string) {
    if (!metadata) return;
    setActiveIntent(intent);
    setAiLoading(true);
    setAiRecommendation(null);
    try {
      const res = await fetch(`${API}/api/ai/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata, intent }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const rec = await res.json();
      setAiRecommendation(rec);
      // Auto-select the recommended format
      const match = metadata.formats.find((f) => f.label === rec.recommended_label);
      if (match) setSelectedFormat(match);
    } catch {
      setAiRecommendation({ recommended_label: "", reason: "AI unavailable", tip: "Select manually." });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="label-xs">AI Assist</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, background: "rgba(0,255,255,0.06)", border: "1px solid rgba(0,255,255,0.15)" }}>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#00ffff", animation: "glow-pulse 1.5s ease-in-out infinite" }} />
          <span style={{ fontSize: 9, color: "rgba(0,255,255,0.7)", letterSpacing: "0.08em", fontWeight: 600 }}>GPT-4o</span>
        </div>
      </div>

      {/* Intent pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {INTENTS.map((intent) => (
          <button
            key={intent.label}
            className={`intent-pill ${activeIntent === intent.label ? "active" : ""}`}
            onClick={() => handleIntent(intent.label)}
            disabled={aiLoading}
            style={{ opacity: aiLoading && activeIntent !== intent.label ? 0.4 : 1 }}
          >
            <span style={{ marginRight: 3, fontSize: 9 }}>{intent.icon}</span>
            {intent.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      <AnimatePresence>
        {aiLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div className="dot-loader" style={{ display: "flex", gap: 3 }}>
              <span /><span /><span />
            </div>
            <span style={{ fontSize: 11, color: "rgba(0,255,255,0.5)" }}>Analyzing video…</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recommendation result */}
      <AnimatePresence>
        {aiRecommendation && !aiLoading && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(0,255,255,0.04)",
              border: "1px solid rgba(0,255,255,0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "rgba(0,255,255,0.6)", letterSpacing: "0.08em", fontWeight: 600, textTransform: "uppercase" }}>Recommended</span>
              <span style={{ fontSize: 11, color: "#00ffff", fontWeight: 700, padding: "1px 8px", background: "rgba(0,255,255,0.1)", borderRadius: 5 }}>
                {aiRecommendation.recommended_label}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 4 }}>
              {aiRecommendation.reason}
            </p>
            {aiRecommendation.tip && (
              <p style={{ fontSize: 11, color: "rgba(0,255,255,0.45)", lineHeight: 1.5 }}>
                ⚡ {aiRecommendation.tip}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
