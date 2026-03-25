"use client";

import { create } from "zustand";
import type {
  ActiveView,
  AiRecommendation,
  BatchItem,
  DownloadStatus,
  Format,
  HistoryItem,
  Preset,
  ProgressInfo,
  Schedule,
  VideoMetadata,
} from "./types";

interface ShadowStore {
  // ── Active view ───────────────────────────────────────────
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;

  // ── Single download ───────────────────────────────────────
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

  proxy: string;
  setProxy: (v: string) => void;

  // ── AI assistant ──────────────────────────────────────────
  aiRecommendation: AiRecommendation | null;
  setAiRecommendation: (r: AiRecommendation | null) => void;
  aiLoading: boolean;
  setAiLoading: (v: boolean) => void;

  // ── Batch queue ───────────────────────────────────────────
  batchItems: BatchItem[];
  setBatchItems: (items: BatchItem[]) => void;
  addBatchItems: (items: BatchItem[]) => void;
  updateBatchItem: (id: string, update: Partial<BatchItem>) => void;
  removeBatchItem: (id: string) => void;

  // ── History ───────────────────────────────────────────────
  history: HistoryItem[];
  setHistory: (h: HistoryItem[]) => void;

  // ── Presets ───────────────────────────────────────────────
  presets: Preset[];
  setPresets: (p: Preset[]) => void;

  // ── Schedules ─────────────────────────────────────────────
  schedules: Schedule[];
  setSchedules: (s: Schedule[]) => void;

  // ── Command palette ───────────────────────────────────────
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;

  // ── Subtitle panel ────────────────────────────────────────
  subtitleSrt: string | null;
  setSubtitleSrt: (s: string | null) => void;

  // ── Toolkit ───────────────────────────────────────────────
  toolkitTaskId: string | null;
  setToolkitTaskId: (id: string | null) => void;

  reset: () => void;
}

export const useStore = create<ShadowStore>((set) => ({
  activeView: "download",
  setActiveView: (activeView) => set({ activeView }),

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
  setDriveStatus: (driveConnected, driveEmail) =>
    set({ driveConnected, driveEmail }),

  saveToDrive: false,
  setSaveToDrive: (saveToDrive) => set({ saveToDrive }),

  driveUrl: null,
  setDriveUrl: (driveUrl) => set({ driveUrl }),

  taskId: null,
  setTaskId: (taskId) => set({ taskId }),

  proxy: "",
  setProxy: (proxy) => set({ proxy }),

  aiRecommendation: null,
  setAiRecommendation: (aiRecommendation) => set({ aiRecommendation }),
  aiLoading: false,
  setAiLoading: (aiLoading) => set({ aiLoading }),

  batchItems: [],
  setBatchItems: (batchItems) => set({ batchItems }),
  addBatchItems: (items) =>
    set((s) => ({ batchItems: [...s.batchItems, ...items] })),
  updateBatchItem: (id, update) =>
    set((s) => ({
      batchItems: s.batchItems.map((item) =>
        item.id === id ? { ...item, ...update } : item
      ),
    })),
  removeBatchItem: (id) =>
    set((s) => ({ batchItems: s.batchItems.filter((i) => i.id !== id) })),

  history: [],
  setHistory: (history) => set({ history }),

  presets: [],
  setPresets: (presets) => set({ presets }),

  schedules: [],
  setSchedules: (schedules) => set({ schedules }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  subtitleSrt: null,
  setSubtitleSrt: (subtitleSrt) => set({ subtitleSrt }),

  toolkitTaskId: null,
  setToolkitTaskId: (toolkitTaskId) => set({ toolkitTaskId }),

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
      aiRecommendation: null,
      subtitleSrt: null,
    }),
}));
