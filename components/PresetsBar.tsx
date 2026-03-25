"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Preset } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function PresetsBar() {
  const { metadata, selectedFormat, setSelectedFormat, saveToDrive, presets, setPresets } = useStore();
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/presets`)
      .then((r) => r.json())
      .then(setPresets)
      .catch(() => {});
  }, [setPresets]);

  async function applyPreset(preset: Preset) {
    if (!metadata?.formats) return;
    const match = metadata.formats.find((f) => f.label === preset.quality_label || f.format_id === preset.format_id);
    if (match) setSelectedFormat(match);
  }

  async function savePreset() {
    if (!selectedFormat || !presetName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName.trim(),
          format_id: selectedFormat.format_id,
          quality_label: selectedFormat.label,
          save_to_drive: saveToDrive,
        }),
      });
      if (!res.ok) throw new Error();
      const newPreset = await res.json();
      setPresets([...presets, newPreset]);
      setPresetName("");
      setShowSaveForm(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset(id: number) {
    await fetch(`${API}/api/presets/${id}`, { method: "DELETE" });
    setPresets(presets.filter((p) => p.id !== id));
  }

  if (!selectedFormat) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="label-xs">Presets</span>
        {presets.map((preset) => (
          <div key={preset.id} style={{ display: "flex", alignItems: "center", gap: 1 }}>
            <button className="preset-chip" onClick={() => applyPreset(preset)}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.2"/></svg>
              {preset.name}
            </button>
            <button
              onClick={() => deletePreset(preset.id)}
              style={{ padding: "3px 4px", color: "rgba(255,255,255,0.2)", fontSize: 12, cursor: "pointer", transition: "color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,80,80,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
            >×</button>
          </div>
        ))}
        <button
          className="preset-chip"
          onClick={() => setShowSaveForm(!showSaveForm)}
          style={{ borderStyle: "dashed" }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          Save current
        </button>
      </div>

      {showSaveForm && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="field-input"
            style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
            placeholder={`e.g. "4K Archive" or "TikTok Style"`}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && savePreset()}
            autoFocus
          />
          <button
            onClick={savePreset}
            disabled={saving || !presetName.trim()}
            className="btn-outline"
            style={{ padding: "7px 14px", fontSize: 12, flexShrink: 0 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setShowSaveForm(false)}
            className="btn-ghost"
            style={{ padding: "7px", flexShrink: 0 }}
          >×</button>
        </div>
      )}
    </div>
  );
}
