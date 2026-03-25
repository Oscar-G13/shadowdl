"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import type { AnalyticsData } from "@/lib/types";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platform";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function HistoryView() {
  const { history, setHistory } = useStore();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/history`).then((r) => r.json()),
      fetch(`${API}/api/analytics`).then((r) => r.json()),
    ])
      .then(([hist, analytics]) => {
        setHistory(hist);
        setAnalytics(analytics);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setHistory]);

  const filtered = history.filter((item) => {
    const matchesQuery = !query || item.title.toLowerCase().includes(query.toLowerCase()) || item.platform.toLowerCase().includes(query.toLowerCase());
    const matchesPlatform = platformFilter === "all" || item.platform === platformFilter;
    return matchesQuery && matchesPlatform;
  });

  const platforms = [...new Set(history.map((h) => h.platform))];
  const maxDayCount = analytics ? Math.max(...analytics.by_day.map((d) => d.count), 1) : 1;

  function exportCSV() {
    const rows = [
      ["ID", "Title", "Platform", "Quality", "URL", "Downloaded At", "Saved to Drive"],
      ...filtered.map((h) => [h.id, `"${h.title.replace(/"/g, '""')}"`, h.platform, h.quality, h.url, h.downloaded_at, h.saved_to_drive ? "Yes" : "No"]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shadowdl_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shadowdl_history.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <div className="dot-loader" style={{ display: "flex", gap: 4 }}><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Analytics cards */}
      {analytics && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Total Downloads" value={analytics.total_downloads} icon="▼" />
          <StatCard label="Drive Saves" value={analytics.drive_saves} icon="☁" color="#00ffff" />
          <StatCard label="Platforms Used" value={Object.keys(analytics.by_platform).length} icon="◈" />
        </motion.div>
      )}

      {/* Platform breakdown */}
      {analytics && Object.keys(analytics.by_platform).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} className="glass-card" style={{ padding: "20px 24px" }}>
          <p className="label-xs" style={{ marginBottom: 16 }}>Downloads by Platform</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(analytics.by_platform)
              .sort((a, b) => b[1] - a[1])
              .map(([platform, count]) => {
                const color = PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS] ?? "#888";
                const label = PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform;
                const max = Math.max(...Object.values(analytics.by_platform));
                return (
                  <div key={platform} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 72, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / max) * 100}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        style={{ height: "100%", background: color, borderRadius: 99, boxShadow: `0 0 6px ${color}60` }}
                      />
                    </div>
                    <span className="font-mono-data" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", width: 24, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
          </div>
        </motion.div>
      )}

      {/* Activity sparkline */}
      {analytics && analytics.by_day.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="glass-card" style={{ padding: "20px 24px" }}>
          <p className="label-xs" style={{ marginBottom: 16 }}>Activity (Last 30 Days)</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
            {analytics.by_day.map((d, i) => (
              <motion.div
                key={d.date}
                title={`${d.date}: ${d.count}`}
                initial={{ height: 0 }}
                animate={{ height: `${(d.count / maxDayCount) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.015, ease: "easeOut" }}
                style={{
                  flex: 1,
                  background: d.count > 0 ? "rgba(0,255,255,0.5)" : "rgba(255,255,255,0.05)",
                  borderRadius: "2px 2px 0 0",
                  minHeight: d.count > 0 ? 3 : 2,
                  boxShadow: d.count > 0 ? "0 0 4px rgba(0,255,255,0.4)" : "none",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Search + filter + export */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="field-input"
          style={{ flex: 1, maxWidth: 280 }}
          placeholder="Search by title or platform…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="field-input"
          style={{ width: 140 }}
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          <option value="all">All platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? p}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportCSV} className="btn-ghost" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v6M2.5 5l3 3 3-3M1 9.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            CSV
          </button>
          <button onClick={exportJSON} className="btn-ghost" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v6M2.5 5l3 3 3-3M1 9.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            JSON
          </button>
        </div>
      </div>

      {/* History table */}
      <div className="glass-card" style={{ overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "rgba(255,255,255,0.2)" }}>
            <p style={{ fontSize: 13 }}>{history.length === 0 ? "No downloads yet." : "No results match your search."}</p>
          </div>
        ) : (
          <div className="scroll-area" style={{ maxHeight: 480 }}>
            {filtered.map((item, i) => {
              const color = PLATFORM_COLORS[item.platform as keyof typeof PLATFORM_COLORS] ?? "#888";
              const label = PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform;
              const date = new Date(item.downloaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 20px",
                    borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", width: 28, textAlign: "right", flexShrink: 0, fontFamily: "monospace" }}>{item.id}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
                    {label}
                  </span>
                  <span className="font-mono-data" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>{item.quality}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{date}</span>
                  {item.saved_to_drive === 1 && (
                    <span className="badge badge-cyan" style={{ flexShrink: 0 }}>Drive</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color = "rgba(255,255,255,0.6)" }: { label: string; value: number; icon: string; color?: string }) {
  return (
    <div className="stat-card">
      <div style={{ fontSize: 24, color, marginBottom: 4 }}>{icon}</div>
      <div className="font-mono-data" style={{ fontSize: 28, fontWeight: 500, color: "#fff", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}
