"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import type { PhraseCaption } from "@/types";

interface Props {
  currentTime: number;
}

/**
 * CaptionOverlay — Phrase-based captions (2-4 words), vibefounder style.
 * White text, no background, text-shadow, bottom center.
 * Visible in all 3 modes (presenter, b-roll, typography).
 */
export default function CaptionOverlay({ currentTime }: Props) {
  const { phraseCaptions } = useProjectStore();

  const activeCaption = useMemo(() => {
    return phraseCaptions.find(
      (c) => currentTime >= c.startTime && currentTime < c.endTime
    ) || null;
  }, [phraseCaptions, currentTime]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="wait">
        {activeCaption && (
          <PhraseDisplay key={activeCaption.id} caption={activeCaption} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PhraseDisplay({ caption }: { caption: PhraseCaption }) {
  return (
    <motion.div
      className="absolute left-0 right-0 bottom-[15%] px-6 flex justify-center"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
    >
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "clamp(24px, 6vw, 48px)",
          fontWeight: 800,
          color: "#FFFFFF",
          textShadow: "0 2px 8px rgba(0,0,0,0.7)",
          lineHeight: 1.2,
          textAlign: "center",
          letterSpacing: "-0.02em",
        }}
      >
        {caption.text}
      </span>
    </motion.div>
  );
}
