"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function DriveConnect() {
  const { driveConnected, driveEmail, setDriveStatus } = useStore();

  useEffect(() => {
    fetch(`${API}/api/auth/status`)
      .then((r) => r.json())
      .then((d) => setDriveStatus(d.connected, d.email))
      .catch(() => {});
  }, [setDriveStatus]);

  async function connect() {
    const res = await fetch(`${API}/api/auth/google`);
    const { auth_url } = await res.json();
    window.location.href = auth_url;
  }

  async function disconnect() {
    await fetch(`${API}/api/auth/google`, { method: "DELETE" });
    setDriveStatus(false, null);
  }

  if (driveConnected && driveEmail) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 6px #00ff88" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{driveEmail}</span>
        </div>
        <button onClick={disconnect} className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button onClick={connect} className="btn-outline flex items-center gap-2">
      <GoogleDriveIcon />
      Google Drive
    </button>
  );
}

function GoogleDriveIcon() {
  return (
    <svg width="14" height="13" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.55A9 9 0 000 53.05h27.5z" fill="#00ac47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.05z" fill="#ea4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="M59.8 53.05H27.5L13.75 76.85c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="M73.4 26.5l-12.6-21.8C60 3.3 58.85 2.2 57.5 1.4L43.75 25l16.05 28.05H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}
