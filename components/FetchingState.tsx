"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";

export function FetchingState() {
  const { status } = useStore();

  return (
    <AnimatePresence>
      {status === "fetching" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="dot-loader flex gap-2">
            <span />
            <span />
            <span />
          </div>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Fetching info
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
