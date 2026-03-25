"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/store";
import type { ActiveView } from "@/lib/types";

interface Action {
  id: string;
  label: string;
  description: string;
  view?: ActiveView;
  icon: React.ReactNode;
  onSelect?: () => void;
}

const ACTIONS: Action[] = [
  { id: "download", label: "Download a video", description: "Paste a URL and download", view: "download", icon: <DownIcon /> },
  { id: "queue", label: "Open Queue", description: "Batch download multiple URLs", view: "queue", icon: <QueueIcon /> },
  { id: "history", label: "View History & Analytics", description: "All past downloads and stats", view: "history", icon: <HistIcon /> },
  { id: "toolkit", label: "Open Video Toolkit", description: "Compress, trim, crop, subtitle", view: "toolkit", icon: <ToolIcon /> },
  { id: "schedule", label: "Schedule Downloads", description: "Set recurring downloads", view: "schedule", icon: <ClockIcon /> },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setActiveView, history } = useStore();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  const filtered = query
    ? ACTIONS.filter(
        (a) =>
          a.label.toLowerCase().includes(query.toLowerCase()) ||
          a.description.toLowerCase().includes(query.toLowerCase())
      )
    : ACTIONS;

  const recentFiltered = !query
    ? history.slice(0, 3)
    : history.filter((h) => h.title.toLowerCase().includes(query.toLowerCase())).slice(0, 3);

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = filtered.length + recentFiltered.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => (i + 1) % total); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => (i - 1 + total) % total); }
    if (e.key === "Enter") {
      if (selectedIdx < filtered.length) {
        const action = filtered[selectedIdx];
        execute(action);
      }
    }
  }

  function execute(action: Action) {
    if (action.view) setActiveView(action.view);
    if (action.onSelect) action.onSelect();
    setCommandPaletteOpen(false);
  }

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          className="cmd-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setCommandPaletteOpen(false)}
        >
          <motion.div
            className="cmd-box"
            initial={{ scale: 0.96, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: -10, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
                <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                className="cmd-input"
                style={{ padding: "20px 0", flex: 1 }}
                placeholder="Search actions…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
                onKeyDown={handleKeyDown}
              />
              <kbd style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "2px 6px" }}>ESC</kbd>
            </div>

            {/* Actions */}
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {filtered.length > 0 && (
                <>
                  <div style={{ padding: "6px 22px 4px", fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Actions</div>
                  {filtered.map((action, i) => (
                    <div
                      key={action.id}
                      className={`cmd-item ${selectedIdx === i ? "selected" : ""}`}
                      onClick={() => execute(action)}
                      onMouseEnter={() => setSelectedIdx(i)}
                    >
                      <div className="cmd-item-icon">{action.icon}</div>
                      <div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{action.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{action.description}</div>
                      </div>
                      <div style={{ marginLeft: "auto", opacity: 0.2 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {recentFiltered.length > 0 && (
                <>
                  <div style={{ padding: "10px 22px 4px", fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Recent</div>
                  {recentFiltered.map((item, i) => (
                    <div
                      key={item.id}
                      className={`cmd-item ${selectedIdx === filtered.length + i ? "selected" : ""}`}
                      onClick={() => { setActiveView("history"); setCommandPaletteOpen(false); }}
                      onMouseEnter={() => setSelectedIdx(filtered.length + i)}
                    >
                      <div className="cmd-item-icon">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{item.platform} · {item.quality}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {filtered.length === 0 && recentFiltered.length === 0 && (
                <div style={{ padding: "24px 22px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.2)" }}>
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div style={{ padding: "10px 22px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 16 }}>
              {[["↑↓", "navigate"], ["↵", "select"], ["⌘K", "close"]].map(([key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <kbd style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "1px 5px" }}>{key}</kbd>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DownIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M3 6l4 4 4-4M1 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function QueueIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="6" width="8" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="10" width="10" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>;
}
function HistIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v4l3 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function ToolIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 2a3.5 3.5 0 0 1-4 5.5L2 10a1.4 1.4 0 1 0 2 2l2.5-2.5A3.5 3.5 0 0 1 12 5.5L10 7.5 6.5 4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
}
function ClockIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
