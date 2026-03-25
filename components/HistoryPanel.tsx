"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import type { HistoryItem } from "@/lib/types";
import { PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/platform";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function HistoryPanel() {
  const [open, setOpen] = useState(false);
  const { history, setHistory } = useStore();

  useEffect(() => {
    if (open) {
      fetch(`${API}/api/history`)
        .then((r) => r.json())
        .then(setHistory)
        .catch(() => {});
    }
  }, [open, setHistory]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost"
        style={{ fontSize: 12, padding: "5px 10px" }}
      >
        History
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              style={{
                position: "fixed", inset: 0,
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(8px)",
                zIndex: 40,
              }}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              style={{
                position: "fixed", right: 0, top: 0,
                height: "100%", width: 340,
                background: "#050505",
                borderLeft: "1px solid rgba(255,255,255,0.06)",
                zIndex: 50,
                display: "flex", flexDirection: "column",
              }}
            >
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div>
                  <p className="font-display" style={{ fontSize: 13, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)" }}>
                    HISTORY
                  </p>
                  {history.length > 0 && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
                      {history.length} download{history.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "rgba(255,255,255,0.4)",
                    cursor: "pointer",
                    fontSize: 16,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  ×
                </button>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {history.length === 0 ? (
                  <div style={{ padding: "60px 24px", textAlign: "center" }}>
                    <div style={{ marginBottom: 12, opacity: 0.15 }}>
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: "0 auto" }}>
                        <circle cx="16" cy="16" r="13" stroke="#00ffff" strokeWidth="1"/>
                        <path d="M16 9v7l4 4" stroke="#00ffff" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", letterSpacing: "0.05em" }}>
                      No downloads yet
                    </p>
                  </div>
                ) : (
                  history.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                    >
                      <HistoryRow item={item} />
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const date = new Date(item.downloaded_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const platformLabel = PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform;
  const platformColor = PLATFORM_COLORS[item.platform as keyof typeof PLATFORM_COLORS] ?? "#888";

  return (
    <div
      style={{
        padding: "14px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        transition: "background 0.15s",
        cursor: "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <p style={{
        fontSize: 13, color: "rgba(255,255,255,0.75)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        marginBottom: 6,
      }}>
        {item.title}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Platform pill */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: platformColor,
          background: `${platformColor}14`,
          border: `1px solid ${platformColor}30`,
          borderRadius: 4,
          padding: "2px 6px",
        }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: platformColor, display: "inline-block" }} />
          {platformLabel}
        </span>

        {/* Quality */}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-mono)" }}>
          {item.quality}
        </span>

        {/* Date */}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>
          {date}
        </span>

        {/* Drive badge */}
        {item.saved_to_drive === 1 && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            color: "rgba(0,255,255,0.6)",
            background: "rgba(0,255,255,0.06)",
            border: "1px solid rgba(0,255,255,0.15)",
            borderRadius: 4,
            padding: "2px 6px",
          }}>
            DRIVE
          </span>
        )}
      </div>
    </div>
  );
}
