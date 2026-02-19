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
  const activeCaption = useMemo(() => {
    const active = captions
      .filter((c) => currentTime >= c.startTime && currentTime < c.endTime)
      .sort((a, b) => a.startTime - b.startTime);
    return active.length > 0 ? active[0] : null;
  }, [captions, currentTime]);

  const captionKey = activeCaption ? activeCaption.id : null;

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
        return "bottom-[12%]";
    }
  }, [caption.style.position]);

  const animVariants = getAnimationVariants(caption.animation);
  const words = caption.text.split(" ");
  const totalWords = words.length;

  // For short captions (1-2 words), calculate which word is active
  const currentWordIndex = useMemo(() => {
    if (totalWords <= 1) return 0;
    const charLengths = words.map((w) => Math.max(w.length, 1));
    const totalChars = charLengths.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    for (let i = 0; i < totalWords; i++) {
      cumulative += charLengths[i] / totalChars;
      if (progress < cumulative) return i;
    }
    return totalWords - 1;
  }, [words, totalWords, progress]);

  // Determine if this is a "short punchy" caption (1-2 words, uppercase)
  const isShortPunchy = totalWords <= 2;

  return (
    <motion.div
      className={`absolute left-0 right-0 ${positionStyle} px-4 flex justify-center`}
      initial={animVariants.initial}
      animate={animVariants.animate}
      exit={animVariants.exit}
      transition={animVariants.transition || { duration: 0.12 }}
    >
      <div className="flex flex-col items-center">
        {/* Emoji floating above the caption */}
        {caption.emoji && (
          <motion.div
            className="mb-1"
            initial={{ opacity: 0, scale: 0.3, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              type: "spring",
              damping: 12,
              stiffness: 300,
              delay: 0.03,
            }}
            style={{
              fontSize: `${caption.style.fontSize * 0.4}px`,
              lineHeight: 1,
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            }}
          >
            {caption.emoji}
          </motion.div>
        )}
        <div
          className="inline-flex flex-wrap justify-center gap-x-[0.3em] gap-y-1 max-w-[92%] px-3 py-2 rounded-xl"
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
            const wordState = getWordState(
              caption.animation,
              i,
              currentWordIndex,
              totalWords,
              progress,
              caption.emphasis,
              word
            );

            // For short punchy captions, all words are "active" (fully visible)
            const isAllActive = isShortPunchy;

            // Determine font size — bigger for short captions
            const baseFontSize = caption.style.fontSize * 0.5;
            const fontSize = isShortPunchy
              ? baseFontSize * 1.15 // Slightly bigger for 1-2 word captions
              : baseFontSize;

            // Determine color
            let color = caption.style.color;
            if (wordState.isEmphasis) {
              color = "#FFD700"; // Gold for emphasis words
            } else if (!isAllActive) {
              if (wordState.isActive) {
                color = wordState.activeColor;
              } else if (wordState.isFuture) {
                color = `${caption.style.color}70`;
              }
            }

            return (
              <motion.span
                key={`${caption.id}-word-${i}`}
                className="inline-block whitespace-nowrap"
                initial={false}
                animate={{
                  scale: wordState.isActive && !isAllActive ? 1.1 : 1,
                  y: wordState.isActive && !isAllActive ? -2 : 0,
                }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                style={{
                  fontFamily: caption.style.fontFamily,
                  fontSize: `${fontSize}px`,
                  fontWeight: caption.style.fontWeight,
                  color,
                  WebkitTextStroke: caption.style.strokeWidth
                    ? `${caption.style.strokeWidth * 0.5}px ${caption.style.strokeColor}`
                    : undefined,
                  textShadow: caption.style.shadowBlur
                    ? `0 2px ${caption.style.shadowBlur}px ${caption.style.shadowColor}, 0 0 ${caption.style.shadowBlur * 2}px ${caption.style.shadowColor}`
                    : undefined,
                  lineHeight: 1.1,
                  letterSpacing: isShortPunchy ? "-0.02em" : undefined,
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
  progress: number,
  emphasis: string[],
  word: string
): WordState {
  const isEmphasis = emphasis.some((e) =>
    word.toLowerCase().replace(/[.,!?;:]/g, "").includes(e.toLowerCase())
  );

  const isPast = wordIndex < currentWordIndex;
  const isActive = wordIndex === currentWordIndex;
  const isFuture = wordIndex > currentWordIndex;

  let activeColor = "#FFD700";

  switch (animation) {
    case "karaoke":
      activeColor = "#FFD700";
      break;
    case "highlight-word":
      return {
        isActive: isEmphasis && isActive,
        isPast,
        isFuture,
        isEmphasis,
        activeColor: "#FFD700",
      };
    case "pop":
      activeColor = "#FFFFFF"; // White for pop — the word itself is the focus
      break;
    case "bounce":
      activeColor = "#4ECDC4";
      break;
    case "glow":
      activeColor = "#00FFFF";
      break;
    case "shake":
      activeColor = "#FF4444";
      break;
    case "wave":
      activeColor = "#A78BFA";
      break;
    case "zoom-in":
      activeColor = "#F97316";
      break;
    case "flip":
      activeColor = "#34D399";
      break;
    case "color-cycle":
      activeColor = `hsl(${(progress * 360) % 360}, 100%, 70%)`;
      break;
    case "typewriter":
      return {
        isActive,
        isPast,
        isFuture,
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
        transition: { duration: 0.15 },
      };
    case "slide-up":
      return {
        initial: { opacity: 0, y: 15 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.12 },
      };
    case "bounce":
      return {
        initial: { opacity: 0, scale: 0.85, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { type: "spring" as const, damping: 14, stiffness: 250 },
      };
    case "pop":
      return {
        initial: { opacity: 0, scale: 0.6, y: 5 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.85 },
        transition: { type: "spring" as const, damping: 16, stiffness: 350, mass: 0.8 },
      };
    case "typewriter":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.08 },
      };
    case "karaoke":
      return {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      };
    case "highlight-word":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      };
    case "glow":
      return {
        initial: { opacity: 0, filter: "brightness(2)" },
        animate: { opacity: 1, filter: "brightness(1)" },
        exit: { opacity: 0, filter: "brightness(2)" },
        transition: { duration: 0.15 },
      };
    case "shake":
      return {
        initial: { opacity: 0, x: -8 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 8 },
        transition: { type: "spring" as const, damping: 10, stiffness: 400 },
      };
    case "wave":
      return {
        initial: { opacity: 0, y: 12, rotate: -2 },
        animate: { opacity: 1, y: 0, rotate: 0 },
        exit: { opacity: 0, y: -8, rotate: 2 },
        transition: { duration: 0.15 },
      };
    case "zoom-in":
      return {
        initial: { opacity: 0, scale: 0.3 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.3 },
        transition: { type: "spring" as const, damping: 12, stiffness: 280 },
      };
    case "flip":
      return {
        initial: { opacity: 0, rotateX: 90 },
        animate: { opacity: 1, rotateX: 0 },
        exit: { opacity: 0, rotateX: -90 },
        transition: { type: "spring" as const, damping: 15, stiffness: 200 },
      };
    case "color-cycle":
      return {
        initial: { opacity: 0, scale: 0.9 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.9 },
        transition: { duration: 0.12 },
      };
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      };
  }
}
