"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import type { Schedule } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CRON_PRESETS = [
  { label: "Every day at 9am", cron: "0 9 * * *" },
  { label: "Every Monday 9am", cron: "0 9 * * 1" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Twice daily (9am & 6pm)", cron: "0 9,18 * * *" },
  { label: "Every Sunday midnight", cron: "0 0 * * 0" },
  { label: "Custom…", cron: "" },
];

export function ScheduleView() {
  const { schedules, setSchedules } = useStore();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [cronPreset, setCronPreset] = useState(CRON_PRESETS[0].cron);
  const [customCron, setCustomCron] = useState("");
  const [quality, setQuality] = useState("Best Quality");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch(`${API}/api/schedules`)
      .then((r) => r.json())
      .then(setSchedules)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setSchedules]);

  const cronExpr = cronPreset || customCron;

  async function createSchedule() {
    if (!url.trim() || !cronExpr.trim()) {
      setFormError("URL and schedule are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`${API}/api/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), title: title.trim() || url.trim(), cron_expr: cronExpr, format_id: null, quality_label: quality }),
      });
      if (!res.ok) throw new Error("Failed to create schedule");
      const s = await res.json();
      setSchedules([s, ...schedules]);
      setUrl(""); setTitle(""); setCustomCron(""); setShowForm(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(id: number) {
    await fetch(`${API}/api/schedules/${id}`, { method: "DELETE" });
    setSchedules(schedules.filter((s) => s.id !== id));
  }

  function formatNextRun(iso: string | null | undefined) {
    if (!iso) return "Not scheduled";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function formatLastRun(iso: string | null | undefined) {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Scheduled Downloads</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Automatically download content on a recurring schedule</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-outline" style={{ marginLeft: "auto", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          New Schedule
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="glass-card" style={{ padding: "24px" }}>
              <p className="label-xs" style={{ marginBottom: 16 }}>New Scheduled Download</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 5, display: "block" }}>VIDEO URL</label>
                  <input className="field-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 5, display: "block" }}>TITLE (optional)</label>
                  <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Daily Tech News" />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 5, display: "block" }}>SCHEDULE</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        className={`intent-pill ${(p.cron ? cronPreset === p.cron : !cronPreset) ? "active" : ""}`}
                        onClick={() => { setCronPreset(p.cron); if (p.cron) setCustomCron(""); }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {!cronPreset && (
                    <input
                      className="field-input"
                      style={{ fontFamily: "monospace", fontSize: 13 }}
                      value={customCron}
                      onChange={(e) => setCustomCron(e.target.value)}
                      placeholder="Cron expression: minute hour day month weekday"
                    />
                  )}
                  {cronExpr && (
                    <p style={{ fontSize: 11, color: "rgba(0,255,255,0.5)", marginTop: 4 }}>
                      Cron: <code style={{ fontFamily: "monospace" }}>{cronExpr}</code>
                    </p>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 5, display: "block" }}>QUALITY</label>
                  <select className="field-input" value={quality} onChange={(e) => setQuality(e.target.value)}>
                    {["Best Quality", "1080p", "720p", "480p", "360p", "Audio Only"].map((q) => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>

                {formError && <p style={{ fontSize: 12, color: "rgba(255,80,80,0.8)" }}>{formError}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={createSchedule} disabled={saving} className="btn-outline" style={{ flex: 1 }}>
                    {saving ? "Saving…" : "Create Schedule"}
                  </button>
                  <button onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule list */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <div className="dot-loader" style={{ display: "flex", gap: 4 }}><span /><span /><span /></div>
        </div>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.15)" }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto 12px" }}>
            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M20 11v10l7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 13 }}>No schedules yet</p>
          <p style={{ fontSize: 11, marginTop: 4, color: "rgba(255,255,255,0.1)" }}>Create one to automate recurring downloads</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedules.map((s) => (
            <ScheduleRow key={s.id} schedule={s} onDelete={() => deleteSchedule(s.id)} formatNextRun={formatNextRun} formatLastRun={formatLastRun} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ schedule, onDelete, formatNextRun, formatLastRun }: {
  schedule: Schedule;
  onDelete: () => void;
  formatNextRun: (s: string | null | undefined) => string;
  formatLastRun: (s: string | null | undefined) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="schedule-row"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500, marginBottom: 4 }}>{schedule.title || schedule.url}</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 8 }}>{schedule.url}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: "rgba(0,255,255,0.4)" }}><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M5 2.5v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Next: {formatNextRun(schedule.next_run)}</span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Last: {formatLastRun(schedule.last_run)}</span>
            </div>
            <code style={{ fontSize: 10, color: "rgba(0,255,255,0.4)", background: "rgba(0,255,255,0.05)", padding: "1px 6px", borderRadius: 4 }}>{schedule.cron_expr}</code>
            <span className="badge badge-gray">{schedule.quality_label}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: schedule.enabled ? "#00ff88" : "rgba(255,255,255,0.2)" }} />
            <span style={{ fontSize: 10, color: schedule.enabled ? "rgba(0,255,136,0.7)" : "rgba(255,255,255,0.2)" }}>
              {schedule.enabled ? "Active" : "Paused"}
            </span>
          </div>
          <button onClick={onDelete} className="btn-ghost" style={{ fontSize: 11, color: "rgba(255,80,80,0.5)" }}>Delete</button>
        </div>
      </div>
    </motion.div>
  );
}
