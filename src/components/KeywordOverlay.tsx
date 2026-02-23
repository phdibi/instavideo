"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";

interface Props {
  currentTime: number;
}

/**
 * KeywordOverlay — Large, bold keyword displayed during the hook segment.
 *
 * Inspired by Captions app: during the hook, the main topic keyword
 * (e.g., "SAÚDE", "TECNOLOGIA") appears as a prominent overlay in
 * golden/yellow text with a cinematic entrance animation.
 *
 * The keyword fades in with a spring scale animation and fades out
 * before the hook ends, giving way to the normal captions.
 */
export default function KeywordOverlay({ currentTime }: Props) {
  const segments = useProjectStore((s) => s.segments);

  // Find active hook segment at current time
  const activeHook = useMemo(() => {
    if (!segments || segments.length === 0) return null;
    return (
      segments.find(
        (s) =>
          s.preset === "hook" &&
          currentTime >= s.startTime &&
          currentTime < s.endTime
      ) || null
    );
  }, [segments, currentTime]);

  if (!activeHook || !activeHook.keywordHighlight) return null;

  const keyword = activeHook.keywordHighlight.toUpperCase();
  const duration = activeHook.endTime - activeHook.startTime;
  const progress = (currentTime - activeHook.startTime) / duration;

  // Keyword visible for the first 65% of the hook, then exits
  const shouldShow = progress < 0.65;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <AnimatePresence mode="wait">
        {shouldShow && (
          <motion.div
            key={`keyword-${activeHook.id}`}
            initial={{ opacity: 0, scale: 0.4, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.15, y: -15 }}
            transition={{
              type: "spring",
              damping: 14,
              stiffness: 180,
              mass: 0.8,
            }}
            className="text-center px-6"
            style={{
              fontSize: "clamp(36px, 9vw, 80px)",
              fontWeight: 900,
              fontFamily: "Inter, system-ui, sans-serif",
              color: "#FFD700",
              textShadow: [
                "0 4px 24px rgba(0,0,0,0.85)",
                "0 2px 8px rgba(0,0,0,0.95)",
                "0 0 60px rgba(255,215,0,0.25)",
                "0 0 120px rgba(255,215,0,0.1)",
              ].join(", "),
              WebkitTextStroke: "1.5px rgba(0,0,0,0.4)",
              letterSpacing: "0.06em",
              lineHeight: 1,
              textTransform: "uppercase" as const,
            }}
          >
            {keyword}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
