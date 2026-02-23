"use client";

import { useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import type { Caption } from "@/types";

interface Props {
  currentTime: number;
}

/**
 * CaptionOverlay — Captions-app inspired word bar renderer.
 *
 * Instead of showing 2-3 words at a time, this renders a horizontal
 * scrolling word bar with ALL words of the current caption visible.
 * The currently spoken word is highlighted (larger, brighter) while
 * past words are slightly dimmed and future words are more dimmed.
 *
 * This matches the Captions app's "perfectly synchronized" caption style.
 */
export default function CaptionOverlay({ currentTime }: Props) {
  const { captions } = useProjectStore();

  // Find the SINGLE most relevant caption at this time.
  const activeCaption = useMemo(() => {
    const active = captions
      .filter((c) => currentTime >= c.startTime && currentTime < c.endTime)
      .sort((a, b) => b.startTime - a.startTime); // latest-start wins
    return active.length > 0 ? active[0] : null;
  }, [captions, currentTime]);

  if (!activeCaption) {
    return <div className="absolute inset-0 pointer-events-none" />;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="popLayout">
        <WordBarCaption
          key={activeCaption.id}
          caption={activeCaption}
          currentTime={currentTime}
        />
      </AnimatePresence>
    </div>
  );
}

/**
 * WordBarCaption renders a horizontal word bar at the bottom of the video.
 * Each word is displayed individually. The currently spoken word is highlighted
 * with a colored background, while other words are visible but dimmer.
 * The bar auto-scrolls horizontally to keep the current word centered.
 */
function WordBarCaption({
  caption,
  currentTime,
}: {
  caption: Caption;
  currentTime: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  const words = caption.text.split(" ").filter(w => w.length > 0);
  const totalWords = words.length;

  // Determine which word is currently being spoken using real word timings
  const currentWordIndex = useMemo(() => {
    if (totalWords <= 1) return 0;

    const timings = caption.wordTimings;
    if (timings && timings.length === totalWords) {
      for (let i = totalWords - 1; i >= 0; i--) {
        if (currentTime >= timings[i].start) return i;
      }
      return 0;
    }

    // Fallback: proportional distribution
    const duration = caption.endTime - caption.startTime;
    const progress = Math.min(
      Math.max((currentTime - caption.startTime) / duration, 0),
      1
    );
    const charLengths = words.map((w) => Math.max(w.length, 1));
    const totalChars = charLengths.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    for (let i = 0; i < totalWords; i++) {
      cumulative += charLengths[i] / totalChars;
      if (progress < cumulative) return i;
    }
    return totalWords - 1;
  }, [words, totalWords, currentTime, caption.wordTimings, caption.startTime, caption.endTime]);

  // Auto-scroll to keep the active word centered
  useEffect(() => {
    if (activeWordRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const wordEl = activeWordRef.current;
      const containerWidth = container.clientWidth;
      const wordLeft = wordEl.offsetLeft;
      const wordWidth = wordEl.offsetWidth;
      const targetScroll = wordLeft - containerWidth / 2 + wordWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: "smooth",
      });
    }
  }, [currentWordIndex]);

  // Check if caption emphasis words match
  const isEmphasisWord = (word: string): boolean => {
    if (!caption.emphasis || caption.emphasis.length === 0) return false;
    const cleaned = word.toLowerCase().replace(/[.,!?;:'"()]/g, "");
    return caption.emphasis.some((e) => cleaned.includes(e.toLowerCase()));
  };

  // Caption style properties
  const fontSize = caption.style.fontSize * 0.42; // Scaled for word bar
  const fontFamily = caption.style.fontFamily || "Inter, system-ui, sans-serif";

  return (
    <motion.div
      className="absolute left-0 right-0 bottom-[10%] px-2 flex justify-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
    >
      {/* Scrollable word bar container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden scrollbar-hide max-w-[95%]"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="inline-flex items-center gap-[0.35em] whitespace-nowrap py-2 px-1">
          {words.map((word, i) => {
            const isActive = i === currentWordIndex;
            const isPast = i < currentWordIndex;
            const isFuture = i > currentWordIndex;
            const isEmphasis = isEmphasisWord(word);

            // Color and opacity based on word state
            let wordColor = caption.style.color || "#FFFFFF";
            let wordOpacity = 1;
            let bgColor = "transparent";
            let wordScale = 1;

            if (isActive) {
              // Current word: bright, highlighted with accent background
              wordColor = "#FFFFFF";
              bgColor = "rgba(120, 90, 255, 0.85)"; // Purple-blue like Captions app
              wordScale = 1.05;
            } else if (isPast) {
              // Past words: visible but slightly dimmed
              wordColor = "#FFFFFF";
              wordOpacity = 0.7;
            } else if (isFuture) {
              // Future words: more dimmed
              wordColor = "#FFFFFF";
              wordOpacity = 0.4;
            }

            if (isEmphasis && !isActive) {
              wordColor = "#FFD700";
              wordOpacity = Math.max(wordOpacity, 0.85);
            }

            return (
              <motion.span
                key={`${caption.id}-w-${i}`}
                ref={isActive ? activeWordRef : undefined}
                className="inline-block rounded-md px-[0.3em] py-[0.15em]"
                animate={{
                  scale: wordScale,
                  opacity: wordOpacity,
                }}
                transition={{ duration: 0.08, ease: "easeOut" }}
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  fontWeight: isActive ? 900 : isEmphasis ? 800 : 700,
                  color: wordColor,
                  backgroundColor: bgColor,
                  textShadow: isActive
                    ? "none"
                    : `0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)`,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}
              >
                {word}
              </motion.span>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
