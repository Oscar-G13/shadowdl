"use client";

import { create } from "zustand";
import type { DownloadStatus, Format, HistoryItem, ProgressInfo, VideoMetadata } from "./types";

interface ShadowStore {
  url: string;
  setUrl: (url: string) => void;

  metadata: VideoMetadata | null;
  setMetadata: (m: VideoMetadata | null) => void;

  selectedFormat: Format | null;
  setSelectedFormat: (f: Format | null) => void;

  status: DownloadStatus;
  setStatus: (s: DownloadStatus) => void;

  progress: ProgressInfo | null;
  setProgress: (p: ProgressInfo | null) => void;

  error: string | null;
  setError: (e: string | null) => void;

  driveConnected: boolean;
  driveEmail: string | null;
  setDriveStatus: (connected: boolean, email: string | null) => void;

  saveToDrive: boolean;
  setSaveToDrive: (v: boolean) => void;

  driveUrl: string | null;
  setDriveUrl: (url: string | null) => void;

  taskId: string | null;
  setTaskId: (id: string | null) => void;

  history: HistoryItem[];
  setHistory: (h: HistoryItem[]) => void;

  cookiesActive: boolean;
  cookiesFilename: string | null;
  setCookiesStatus: (active: boolean, filename: string | null) => void;

  reset: () => void;
}

export const useStore = create<ShadowStore>((set) => ({
  url: "",
  setUrl: (url) => set({ url }),

  metadata: null,
  setMetadata: (metadata) => set({ metadata }),

  selectedFormat: null,
  setSelectedFormat: (selectedFormat) => set({ selectedFormat }),

  status: "idle",
  setStatus: (status) => set({ status }),

  progress: null,
  setProgress: (progress) => set({ progress }),

  error: null,
  setError: (error) => set({ error }),

  driveConnected: false,
  driveEmail: null,
  setDriveStatus: (driveConnected, driveEmail) => set({ driveConnected, driveEmail }),

  saveToDrive: false,
  setSaveToDrive: (saveToDrive) => set({ saveToDrive }),

  driveUrl: null,
  setDriveUrl: (driveUrl) => set({ driveUrl }),

  taskId: null,
  setTaskId: (taskId) => set({ taskId }),

  history: [],
  setHistory: (history) => set({ history }),

  cookiesActive: false,
  cookiesFilename: null,
  setCookiesStatus: (cookiesActive, cookiesFilename) => set({ cookiesActive, cookiesFilename }),

  reset: () =>
    set({
      metadata: null,
      selectedFormat: null,
      status: "idle",
      progress: null,
      error: null,
      driveUrl: null,
      taskId: null,
      saveToDrive: false,
    }),
}));
