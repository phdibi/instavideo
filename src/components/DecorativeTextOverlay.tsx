"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";

interface Props {
  currentTime: number;
}

/**
 * DecorativeTextOverlay — renders large, repeating keyword text behind the video
 * content, similar to Captions app "Volt" style. The keyword scrolls vertically
 * and creates a visually striking background effect.
 *
 * Uses the AI preset segment's keywordHighlight to determine what text to show.
 */
export default function DecorativeTextOverlay({ currentTime }: Props) {
  const { segments } = useProjectStore();

  // Find the active segment at this time
  const activeSegment = useMemo(() => {
    if (!segments || segments.length === 0) return null;
    const active = segments.filter(
      (s) => currentTime >= s.startTime && currentTime < s.endTime
    );
    return active.length > 0 ? active[0] : null;
  }, [segments, currentTime]);

  // Only show decorative text for hook and futuristic-hud presets,
  // or when there's a strong keyword highlight
  const shouldShow = useMemo(() => {
    if (!activeSegment) return false;
    if (!activeSegment.keywordHighlight) return false;
    if (activeSegment.keywordHighlight.length < 3) return false;
    // Show on hook segments, futuristic-hud, and talking-head-broll
    return ["hook", "futuristic-hud", "talking-head-broll"].includes(
      activeSegment.preset
    );
  }, [activeSegment]);

  const keyword = activeSegment?.keywordHighlight?.toUpperCase() || "";
  const segmentKey = activeSegment?.id || "none";

  // Calculate scroll progress within the segment for animation
  const scrollProgress = useMemo(() => {
    if (!activeSegment) return 0;
    const dur = activeSegment.endTime - activeSegment.startTime;
    if (dur <= 0) return 0;
    return (currentTime - activeSegment.startTime) / dur;
  }, [activeSegment, currentTime]);

  if (!shouldShow || !keyword) return null;

  // Generate repeated lines of the keyword
  const lineCount = 6;
  const yOffset = scrollProgress * -40; // Scroll upward as segment progresses

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={segmentKey}
          className="absolute inset-0 flex flex-col justify-center items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            transform: `translateY(${yOffset}px)`,
          }}
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div
              key={i}
              className="whitespace-nowrap leading-none"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "clamp(28px, 8vw, 64px)",
                fontWeight: 900,
                fontStyle: "italic",
                color: "transparent",
                WebkitTextStroke: "1px rgba(255,255,255,0.12)",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                // Alternate slight horizontal offset for visual interest
                transform: `translateX(${i % 2 === 0 ? -8 : 8}px)`,
                userSelect: "none",
              }}
            >
              {keyword}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
