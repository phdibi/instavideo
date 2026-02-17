"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import type { Caption, CaptionAnimation } from "@/types";

interface Props {
  currentTime: number;
}

export default function CaptionOverlay({ currentTime }: Props) {
  const { captions } = useProjectStore();

  // Find the SINGLE most relevant caption at this time
  // Only show ONE caption at a time - pick the one with earliest start time
  // Use a stable key based on caption text + timing to prevent excessive re-renders
  const activeCaption = useMemo(() => {
    const active = captions
      .filter((c) => currentTime >= c.startTime && currentTime < c.endTime)
      .sort((a, b) => a.startTime - b.startTime);
    return active.length > 0 ? active[0] : null;
  }, [captions, currentTime]);

  // Stable key: only change when the actual caption identity changes, not on every edit
  const captionKey = activeCaption
    ? `${activeCaption.id}-${activeCaption.startTime.toFixed(2)}`
    : null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="wait">
        {activeCaption && captionKey && (
          <CaptionDisplay
            key={captionKey}
            caption={activeCaption}
            currentTime={currentTime}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CaptionDisplay({
  caption,
  currentTime,
}: {
  caption: Caption;
  currentTime: number;
}) {
  const duration = caption.endTime - caption.startTime;
  const progress = Math.min(
    Math.max((currentTime - caption.startTime) / duration, 0),
    1
  );

  const positionStyle = useMemo(() => {
    switch (caption.style.position) {
      case "top":
        return "top-[8%]";
      case "center":
        return "top-1/2 -translate-y-1/2";
      case "bottom":
      default:
        return "bottom-[10%]";
    }
  }, [caption.style.position]);

  const animVariants = getAnimationVariants(caption.animation);
  const words = caption.text.split(" ");
  const totalWords = words.length;

  // Calculate which word is currently being spoken
  // Each word gets an equal share of the total duration
  const currentWordIndex = Math.min(
    Math.floor(progress * totalWords),
    totalWords - 1
  );

  return (
    <motion.div
      className={`absolute left-0 right-0 ${positionStyle} px-4 flex justify-center`}
      initial={animVariants.initial}
      animate={animVariants.animate}
      exit={animVariants.exit}
      transition={{ duration: 0.2 }}
    >
      <div
        className="inline-flex flex-wrap justify-center gap-x-[0.35em] gap-y-1 max-w-[90%] px-3 py-2 rounded-xl"
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
          // Determine word state based on animation type
          const wordState = getWordState(
            caption.animation,
            i,
            currentWordIndex,
            totalWords,
            progress,
            caption.emphasis,
            word
          );

          return (
            <motion.span
              key={`${caption.id}-word-${i}`}
              className="inline-block whitespace-nowrap"
              initial={false}
              animate={{
                scale: wordState.isActive ? 1.12 : 1,
                y: wordState.isActive ? -2 : 0,
              }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              style={{
                fontFamily: caption.style.fontFamily,
                fontSize: `${caption.style.fontSize * 0.5}px`,
                fontWeight: wordState.isActive
                  ? 900
                  : wordState.isEmphasis
                  ? 900
                  : caption.style.fontWeight,
                color: wordState.isActive
                  ? wordState.activeColor
                  : wordState.isEmphasis
                  ? "#FFD700"
                  : wordState.isPast
                  ? caption.style.color
                  : `${caption.style.color}99`,
                WebkitTextStroke: caption.style.strokeWidth
                  ? `${caption.style.strokeWidth * 0.5}px ${caption.style.strokeColor}`
                  : undefined,
                textShadow: wordState.isActive
                  ? `0 0 20px ${wordState.activeColor}80, 0 2px ${caption.style.shadowBlur}px ${caption.style.shadowColor}`
                  : caption.style.shadowBlur
                  ? `0 2px ${caption.style.shadowBlur}px ${caption.style.shadowColor}`
                  : undefined,
                transition: "color 0.15s ease, opacity 0.15s ease",
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

interface WordState {
  isActive: boolean;
  isPast: boolean;
  isFuture: boolean;
  isEmphasis: boolean;
  activeColor: string;
}

function getWordState(
  animation: CaptionAnimation,
  wordIndex: number,
  currentWordIndex: number,
  _totalWords: number,
  _progress: number,
  emphasis: string[],
  word: string
): WordState {
  const isEmphasis = emphasis.some((e) =>
    word.toLowerCase().replace(/[.,!?;:]/g, "").includes(e.toLowerCase())
  );

  const isPast = wordIndex < currentWordIndex;
  const isActive = wordIndex === currentWordIndex;
  const isFuture = wordIndex > currentWordIndex;

  let activeColor = "#FFD700"; // Default gold highlight

  switch (animation) {
    case "karaoke":
      activeColor = "#FFD700";
      break;
    case "highlight-word":
      // In highlight-word mode, emphasize specific words
      return {
        isActive: isEmphasis && isActive,
        isPast,
        isFuture,
        isEmphasis,
        activeColor: "#FFD700",
      };
    case "pop":
      activeColor = "#FF6B6B";
      break;
    case "bounce":
      activeColor = "#4ECDC4";
      break;
    case "typewriter":
      // Show words progressively
      return {
        isActive,
        isPast,
        isFuture: isFuture,
        isEmphasis,
        activeColor: "#FFFFFF",
      };
    case "fade":
    case "slide-up":
    default:
      activeColor = "#FFD700";
      break;
  }

  return { isActive, isPast, isFuture, isEmphasis, activeColor };
}

function getAnimationVariants(animation: CaptionAnimation) {
  switch (animation) {
    case "fade":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
    case "slide-up":
      return {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
      };
    case "bounce":
      return {
        initial: { opacity: 0, scale: 0.8, y: 15 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: {
            type: "spring" as const,
            damping: 12,
            stiffness: 200,
          },
        },
        exit: { opacity: 0, scale: 0.9 },
      };
    case "pop":
      return {
        initial: { opacity: 0, scale: 0.5 },
        animate: {
          opacity: 1,
          scale: 1,
          transition: {
            type: "spring" as const,
            damping: 14,
            stiffness: 300,
          },
        },
        exit: { opacity: 0, scale: 0.8 },
      };
    case "typewriter":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
    case "karaoke":
      return {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
      };
    case "highlight-word":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  }
}
