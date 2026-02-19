"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import type { Caption, CaptionAnimation, CaptionTheme } from "@/types";

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

// ===== Theme color palettes =====
const THEME_COLORS: Record<CaptionTheme, {
  highlight: string;       // Emphasis/keyword highlight color
  highlightGlow: string;   // Glow shadow for emphasis
  topicLabelColor: string; // Topic label text color
  keywordColor: string;    // Large keyword label color
  captionColor: string;    // Default caption text color (warm/cool)
  quoteColor: string;      // Decorative quote color
}> = {
  volt: {
    highlight: "#CCFF00",
    highlightGlow: "rgba(204,255,0,0.3)",
    topicLabelColor: "#CCFF00",
    keywordColor: "#CCFF00",
    captionColor: "#FFFFFF",
    quoteColor: "#CCFF00",
  },
  ember: {
    highlight: "#D4835C",
    highlightGlow: "rgba(212,131,92,0.35)",
    topicLabelColor: "#D4835C",
    keywordColor: "#D4835C",
    captionColor: "#F0E6D0",
    quoteColor: "#C8956A",
  },
  velocity: {
    highlight: "#FFD700",
    highlightGlow: "rgba(255,215,0,0.4)",
    topicLabelColor: "#FFD700",
    keywordColor: "#FFD700",
    captionColor: "#FFFFFF",
    quoteColor: "#DAA520",
  },
};

// Detect theme from caption properties
function detectTheme(caption: Caption): CaptionTheme {
  // Velocity: golden shadow color is the signature
  if (caption.style.shadowColor === "rgba(255,215,0,0.6)"
    || caption.style.shadowColor === "rgba(255,215,0,0.5)") return "velocity";
  // If caption has keywordQuotes, check for Velocity vs Ember
  if (caption.keywordQuotes) {
    // Velocity uses white text, Ember uses cream
    if (caption.style.color === "#FFFFFF") return "velocity";
    return "ember";
  }
  // If caption color is warm (cream/beige), it's Ember
  if (caption.style.color === "#F0E6D0" || caption.style.color === "#D4835C") return "ember";
  return "volt";
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

  const theme = useMemo(() => detectTheme(caption), [caption]);
  const colors = THEME_COLORS[theme];

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

  // When keywordLabel matches the caption text, hide the subtitle to avoid duplication.
  // e.g., keyword "CAPACIDADE" + caption "CAPACIDADE" → only show large keyword
  // But keyword "CAPACIDADE" + caption "vocês atinjam" → show both layers
  const keywordMatchesCaption = caption.keywordLabel
    && caption.text.toUpperCase().trim() === caption.keywordLabel.toUpperCase().trim();
  const showSubtitle = !keywordMatchesCaption;

  return (
    <motion.div
      className={`absolute left-0 right-0 ${positionStyle} px-4 flex justify-center`}
      initial={animVariants.initial}
      animate={animVariants.animate}
      exit={animVariants.exit}
      transition={animVariants.transition || { duration: 0.12 }}
    >
      <div className="flex flex-col items-center">
        {/* Topic label tag (like "● LEARNING" in Captions app) */}
        {caption.topicLabel && !caption.keywordLabel && (
          <motion.div
            className="mb-1.5 px-3 py-0.5 rounded-full"
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              fontSize: `${Math.max(10, caption.style.fontSize * 0.18)}px`,
              fontWeight: 700,
              fontFamily: caption.style.fontFamily,
              color: colors.topicLabelColor,
              letterSpacing: "0.08em",
              lineHeight: 1.4,
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            <span style={{ marginRight: "0.3em" }}>●</span>
            {caption.topicLabel}
          </motion.div>
        )}

        {/* Dual-layer: Large keyword ABOVE caption (Ember/Velocity) */}
        {caption.keywordLabel && (
          <motion.div
            className="mb-2 flex items-baseline justify-center"
            initial={{ opacity: 0, scale: theme === "velocity" ? 0.5 : 0.7, y: theme === "velocity" ? 15 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              type: "spring",
              damping: theme === "velocity" ? 12 : 14,
              stiffness: theme === "velocity" ? 320 : 280,
              delay: 0.02,
            }}
            style={{
              lineHeight: 1,
            }}
          >
            {/* Decorative opening quote — Velocity: bold sans-serif gold, Ember: curly serif */}
            {caption.keywordQuotes && (
              <span
                style={{
                  fontSize: `${caption.style.fontSize * (theme === "velocity" ? 0.6 : 0.55)}px`,
                  fontWeight: 900,
                  color: colors.quoteColor,
                  opacity: theme === "velocity" ? 0.9 : 0.7,
                  marginRight: "0.05em",
                  fontFamily: theme === "velocity"
                    ? "Inter, system-ui, sans-serif"
                    : "Georgia, 'Times New Roman', serif",
                  fontStyle: theme === "velocity" ? "italic" : "normal",
                  lineHeight: 1,
                  textShadow: theme === "velocity"
                    ? `0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(255,215,0,0.3)`
                    : `0 2px 6px rgba(0,0,0,0.6)`,
                }}
              >
                {"\u201C"}
              </span>
            )}
            <span
              style={{
                fontFamily: caption.style.fontFamily,
                fontSize: `${caption.style.fontSize * (theme === "velocity" ? 0.6 : 0.55)}px`,
                fontWeight: 900,
                fontStyle: theme === "velocity" ? "italic" : "normal",
                color: colors.keywordColor,
                letterSpacing: theme === "velocity" ? "-0.03em" : "-0.02em",
                textShadow: theme === "velocity"
                  ? `0 3px 10px rgba(0,0,0,0.8), 0 0 25px ${colors.highlightGlow}, 0 0 50px rgba(255,215,0,0.15)`
                  : `0 2px 8px rgba(0,0,0,0.7), 0 0 20px ${colors.highlightGlow}`,
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {caption.keywordLabel}
            </span>
            {/* Decorative closing quote */}
            {caption.keywordQuotes && (
              <span
                style={{
                  fontSize: `${caption.style.fontSize * (theme === "velocity" ? 0.6 : 0.55)}px`,
                  fontWeight: 900,
                  color: colors.quoteColor,
                  opacity: theme === "velocity" ? 0.9 : 0.7,
                  marginLeft: "0.05em",
                  fontFamily: theme === "velocity"
                    ? "Inter, system-ui, sans-serif"
                    : "Georgia, 'Times New Roman', serif",
                  fontStyle: theme === "velocity" ? "italic" : "normal",
                  lineHeight: 1,
                  textShadow: theme === "velocity"
                    ? `0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(255,215,0,0.3)`
                    : `0 2px 6px rgba(0,0,0,0.6)`,
                }}
              >
                {"\u201D"}
              </span>
            )}
          </motion.div>
        )}

        {/* Emoji floating above the caption */}
        {caption.emoji && !caption.keywordLabel && (
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
        {/* Subtitle words — hidden when keyword matches caption text (avoid duplication) */}
        {showSubtitle && <div
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
            // When keywordLabel is present, the subtitle is smaller (Ember dual-layer)
            const baseFontSize = caption.style.fontSize * 0.5;
            const fontSize = caption.keywordLabel
              ? baseFontSize * 0.85 // Smaller subtitle below keyword
              : isShortPunchy
                ? baseFontSize * 1.15 // Slightly bigger for 1-2 word captions
                : baseFontSize;

            // Determine color — theme-aware emphasis colors
            let color = caption.style.color;
            if (wordState.isEmphasis) {
              color = colors.highlight;
            } else if (!isAllActive) {
              if (wordState.isActive) {
                color = wordState.activeColor;
              } else if (wordState.isFuture) {
                color = `${caption.style.color}70`;
              }
            }

            // Emphasis words get italic + slightly larger
            const isEmphasized = wordState.isEmphasis;
            // Ember style: emphasis is bold but NOT italic (editorial/clean)
            // Velocity style: ultra-bold italic with stronger scale
            const emphasisScale = isEmphasized
              ? (theme === "velocity" ? 1.15 : theme === "ember" ? 1.08 : 1.12)
              : 1;
            const emphasisFontStyle = isEmphasized
              ? (theme === "ember" ? "normal" : "italic")
              : (theme === "velocity" ? "italic" : "normal");

            return (
              <motion.span
                key={`${caption.id}-word-${i}`}
                className="inline-block whitespace-nowrap"
                initial={false}
                animate={{
                  scale: isEmphasized
                    ? emphasisScale
                    : wordState.isActive && !isAllActive ? 1.1 : 1,
                  y: wordState.isActive && !isAllActive ? -2 : 0,
                }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                style={{
                  fontFamily: caption.style.fontFamily,
                  fontSize: `${fontSize}px`,
                  fontWeight: isEmphasized ? 900 : caption.style.fontWeight,
                  fontStyle: emphasisFontStyle,
                  color,
                  WebkitTextStroke: caption.style.strokeWidth
                    ? `${caption.style.strokeWidth * 0.5}px ${caption.style.strokeColor}`
                    : undefined,
                  textShadow: isEmphasized
                    ? `0 2px ${caption.style.shadowBlur}px ${caption.style.shadowColor}, 0 0 ${caption.style.shadowBlur * 3}px ${colors.highlightGlow}`
                    : caption.style.shadowBlur
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
        </div>}
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
