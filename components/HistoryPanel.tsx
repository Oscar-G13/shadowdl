"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import type { HistoryItem } from "@/lib/types";
import { PLATFORM_LABELS } from "@/lib/platform";

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
        className="text-sm text-white/40 hover:text-white/80 transition-colors"
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
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-80 bg-[#070707] border-l border-[#1a1a1a] z-50 flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-[#1a1a1a]">
                <h2 className="font-semibold text-sm text-white">Recent Downloads</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-white/30 hover:text-white transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-white/20 text-sm text-center mt-10">No downloads yet.</p>
                ) : (
                  history.map((item) => <HistoryRow key={item.id} item={item} />)
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

  return (
    <div className="px-5 py-4 border-b border-[#111] hover:bg-[#0d0d0d] transition-colors">
      <p className="text-sm text-white/80 truncate">{item.title}</p>
      <div className="flex items-center gap-2 mt-1 text-xs text-white/30">
        <span>{PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform}</span>
        <span>·</span>
        <span>{item.quality}</span>
        <span>·</span>
        <span>{date}</span>
        {item.saved_to_drive === 1 && (
          <>
            <span>·</span>
            <span className="text-[#00ffff]/60">Drive</span>
          </>
        )}
      </div>
    </div>
  );
}
