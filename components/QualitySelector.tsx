"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { formatBytes } from "@/lib/platform";
import { AIAssistant } from "./AIAssistant";
import { PresetsBar } from "./PresetsBar";

export function QualitySelector() {
  const { metadata, selectedFormat, setSelectedFormat, saveToDrive, setSaveToDrive, driveConnected } = useStore();

  if (!metadata?.formats?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="flex flex-col"
      style={{ gap: "18px" }}
    >
      {/* Quality pills */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="label-xs" style={{ paddingLeft: 2 }}>Quality</p>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {metadata.formats.map((fmt) => {
            const isActive = selectedFormat?.format_id === fmt.format_id;
            return (
              <button
                key={fmt.format_id}
                onClick={() => setSelectedFormat(fmt)}
                className={`quality-pill ${isActive ? "active" : ""}`}
                style={{ padding: "10px 16px", textAlign: "left" }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#00ffff" : "#fff", letterSpacing: "0.02em" }}>
                  {fmt.label}
                </div>
                {fmt.filesize && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                    {formatBytes(fmt.filesize)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Presets */}
      <PresetsBar />

      {/* AI Assistant */}
      <AIAssistant />

      {/* Drive toggle */}
      {driveConnected && (
        <div
          className="flex items-center gap-3 cursor-pointer w-fit"
          onClick={() => setSaveToDrive(!saveToDrive)}
          style={{ userSelect: "none" }}
        >
          <div
            className="toggle-track"
            style={{ background: saveToDrive ? "#00ffff" : "rgba(255,255,255,0.08)", border: saveToDrive ? "none" : "1px solid rgba(255,255,255,0.12)" }}
          >
            <div
              className="toggle-thumb"
              style={{
                background: saveToDrive ? "#000" : "rgba(255,255,255,0.4)",
                transform: saveToDrive ? "translateX(16px)" : "translateX(0px)",
              }}
            />
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Save to Google Drive</span>
        </div>
      )}
    </motion.div>
  );
}
