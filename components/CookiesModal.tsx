"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CookiesModalProps {
  open: boolean;
  onClose: () => void;
}

export function CookiesModal({ open, onClose }: CookiesModalProps) {
  const { cookiesActive, cookiesFilename, setCookiesStatus } = useStore();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/api/cookies/status`)
      .then((r) => r.json())
      .then((d) => setCookiesStatus(d.active, d.filename))
      .catch(() => {});
  }, [open, setCookiesStatus]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/cookies/upload`, { method: "POST", body: form });
      const data = await res.json();
      setCookiesStatus(true, data.filename);
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  }

  async function handleClear() {
    await fetch(`${API}/api/cookies`, { method: "DELETE" }).catch(() => {});
    setCookiesStatus(false, null);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              zIndex: 40,
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2 }}
            className="glass-card"
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(440px, calc(100vw - 32px))",
              zIndex: 50,
              padding: 28,
              display: "flex", flexDirection: "column", gap: 20,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p className="font-display" style={{ fontSize: 13, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)" }}>
                  COOKIE IMPORT
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                  For login-walled or age-gated content
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            {!cookiesActive ? (
              <div
                className={`drop-zone${dragging ? " drag-over" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                {uploading ? (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Uploading…</p>
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto 12px" }}>
                      <path d="M14 4v14M7 11l7-7 7 7" stroke="#00ffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                      <path d="M4 22h20" stroke="#00ffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
                    </svg>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                      Drop <span style={{ color: "rgba(0,255,255,0.8)" }}>cookies.txt</span> here or click to browse
                    </p>
                    <p className="label-xs" style={{ opacity: 0.35 }}>
                      Use the &ldquo;Get cookies.txt LOCALLY&rdquo; Chrome extension
                    </p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".txt" style={{ display: "none" }} onChange={onInputChange} />
              </div>
            ) : (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px",
                background: "rgba(0,255,136,0.05)",
                border: "1px solid rgba(0,255,136,0.15)",
                borderRadius: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", display: "inline-block", boxShadow: "0 0 6px #00ff88" }} />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{cookiesFilename ?? "cookies.txt"} active</span>
                </div>
                <button
                  onClick={handleClear}
                  style={{
                    fontSize: 11, color: "rgba(255,255,255,0.3)", background: "none", border: "none",
                    cursor: "pointer", letterSpacing: "0.04em", transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,80,80,0.8)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"; }}
                >
                  Clear
                </button>
              </div>
            )}

            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", lineHeight: 1.6 }}>
              Cookies are stored server-side and sent with every yt-dlp request. Remove them when done for privacy.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function CookiesButton() {
  const [open, setOpen] = useState(false);
  const { cookiesActive } = useStore();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost"
        style={{ fontSize: 12, padding: "5px 10px", position: "relative" }}
      >
        Cookies
        {cookiesActive && (
          <span style={{
            position: "absolute", top: 3, right: 3,
            width: 5, height: 5, borderRadius: "50%",
            background: "#00ff88",
            boxShadow: "0 0 4px #00ff88",
          }} />
        )}
      </button>
      <CookiesModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
