"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";

export function FetchingState() {
  const { status } = useStore();
  if (status !== "fetching") return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-3xl mx-auto flex items-center gap-3 text-white/40 text-sm"
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <span>Fetching video info…</span>
    </motion.div>
  );
}
