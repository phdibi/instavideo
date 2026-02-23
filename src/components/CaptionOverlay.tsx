"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import type { Caption } from "@/types";

interface Props {
  currentTime: number;
}

/**
 * CaptionOverlay — Captions-app inspired fluid word reveal.
 *
 * Shows 2-3 words at a time, with each group popping in smoothly as spoken.
 * The current word within the group is highlighted (brighter, slightly scaled).
 * Transitions between groups are fluid fade/slide animations.
 *
 * Key insight from Captions app: on the VIDEO SCREEN, only 1-2 words are
 * visible at a time. They appear fluidly one by one during playback.
 */
export default function CaptionOverlay({ currentTime }: Props) {
  const { captions } = useProjectStore();

  // Find the SINGLE most relevant caption at this time.
  const activeCaption = useMemo(() => {
    const active = captions
      .filter((c) => currentTime >= c.startTime && currentTime < c.endTime)
      .sort((a, b) => b.startTime - a.startTime);
    return active.length > 0 ? active[0] : null;
  }, [captions, currentTime]);

  if (!activeCaption) {
    return <div className="absolute inset-0 pointer-events-none" />;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="popLayout">
        <FluidCaption
          key={activeCaption.id}
          caption={activeCaption}
          currentTime={currentTime}
        />
      </AnimatePresence>
    </div>
  );
}

/**
 * FluidCaption renders 2-3 words with smooth pop-in animation.
 * The currently spoken word is highlighted (brighter, slightly larger).
 * Words flow naturally with speech — each group appears as a cohesive unit.
 */
function FluidCaption({
  caption,
  currentTime,
}: {
  caption: Caption;
  currentTime: number;
}) {
  const words = caption.text.split(" ").filter((w) => w.length > 0);
  const totalWords = words.length;

  // Determine which word is currently being spoken
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
  }, [
    words,
    totalWords,
    currentTime,
    caption.wordTimings,
    caption.startTime,
    caption.endTime,
  ]);

  // Check if word is an emphasis word
  const isEmphasisWord = (word: string): boolean => {
    if (!caption.emphasis || caption.emphasis.length === 0) return false;
    const cleaned = word.toLowerCase().replace(/[.,!?;:'"()]/g, "");
    return caption.emphasis.some((e) => cleaned.includes(e.toLowerCase()));
  };

  // Short captions (1-2 words) show all words fully active
  const isShortPunchy = totalWords <= 2;

  const fontFamily = caption.style.fontFamily || "Inter, system-ui, sans-serif";
  // Size: large enough to read, scales with caption style
  const baseFontSize = caption.style.fontSize * 0.5;

  return (
    <motion.div
      className="absolute left-0 right-0 bottom-[12%] px-4 flex justify-center"
      initial={{ opacity: 0, y: 12, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{
        type: "spring",
        damping: 22,
        stiffness: 320,
        mass: 0.8,
      }}
    >
      <div
        className="inline-flex flex-wrap justify-center gap-x-[0.35em] gap-y-1 max-w-[92%] px-3 py-2 rounded-xl"
        style={{
          backgroundColor:
            caption.style.backgroundOpacity > 0
              ? `${caption.style.backgroundColor}${Math.round(
                  caption.style.backgroundOpacity * 255
                )
                  .toString(16)
                  .padStart(2, "0")}`
              : "transparent",
        }}
      >
        {words.map((word, i) => {
          const isActive = i === currentWordIndex;
          const isPast = i < currentWordIndex;
          const isEmphasis = isEmphasisWord(word);

          // All words visible, but current word is highlighted
          let wordColor = caption.style.color || "#FFFFFF";
          let wordOpacity = 1;
          let wordScale = 1;

          if (isShortPunchy) {
            // Short captions: all words fully active
            wordColor = "#FFFFFF";
            wordOpacity = 1;
            wordScale = 1;
          } else if (isActive) {
            // Currently spoken word: bright, slightly larger
            wordColor = "#FFFFFF";
            wordOpacity = 1;
            wordScale = 1.08;
          } else if (isPast) {
            // Already spoken: slightly dimmed
            wordColor = "#FFFFFF";
            wordOpacity = 0.6;
          } else {
            // Not yet spoken: more dimmed
            wordColor = "#FFFFFF";
            wordOpacity = 0.35;
          }

          if (isEmphasis) {
            wordColor = "#FFD700";
            wordOpacity = Math.max(wordOpacity, 0.9);
          }

          return (
            <motion.span
              key={`${caption.id}-w-${i}`}
              className="inline-block whitespace-nowrap"
              animate={{
                scale: isActive && !isShortPunchy ? wordScale : 1,
                opacity: wordOpacity,
                y: isActive && !isShortPunchy ? -2 : 0,
              }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              style={{
                fontFamily,
                fontSize: `${baseFontSize}px`,
                fontWeight: isActive || isEmphasis ? 900 : caption.style.fontWeight,
                color: wordColor,
                WebkitTextStroke: caption.style.strokeWidth
                  ? `${caption.style.strokeWidth * 0.5}px ${caption.style.strokeColor}`
                  : undefined,
                textShadow: isActive
                  ? `0 2px ${caption.style.shadowBlur || 6}px rgba(0,0,0,0.95), 0 0 ${(caption.style.shadowBlur || 6) * 2}px rgba(0,0,0,0.5)`
                  : caption.style.shadowBlur
                    ? `0 2px ${caption.style.shadowBlur}px ${caption.style.shadowColor}, 0 0 ${caption.style.shadowBlur * 2}px ${caption.style.shadowColor}`
                    : "0 2px 6px rgba(0,0,0,0.9)",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {word}
            </motion.span>
          );
        })}
      </div>
    </motion.div>
  );
}
