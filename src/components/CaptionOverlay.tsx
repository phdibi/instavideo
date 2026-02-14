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

  const activeCaptions = useMemo(
    () =>
      captions.filter(
        (c) => currentTime >= c.startTime && currentTime <= c.endTime
      ),
    [captions, currentTime]
  );

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex flex-col justify-end">
      <AnimatePresence mode="wait">
        {activeCaptions.map((caption) => (
          <CaptionDisplay
            key={caption.id}
            caption={caption}
            currentTime={currentTime}
          />
        ))}
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
  const progress =
    (currentTime - caption.startTime) / (caption.endTime - caption.startTime);
  const positionClass =
    caption.style.position === "top"
      ? "top-[10%]"
      : caption.style.position === "center"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-[12%]";

  const animVariants = getAnimationVariants(caption.animation);

  const words = caption.text.split(" ");

  return (
    <motion.div
      className={`absolute left-0 right-0 ${positionClass} px-8`}
      initial={animVariants.initial}
      animate={animVariants.animate}
      exit={animVariants.exit}
      transition={{ duration: 0.3 }}
      style={{ textAlign: caption.style.textAlign }}
    >
      <span
        className="inline-block px-4 py-2 rounded-lg"
        style={{
          backgroundColor: caption.style.backgroundColor
            ? `${caption.style.backgroundColor}${Math.round(
                caption.style.backgroundOpacity * 255
              )
                .toString(16)
                .padStart(2, "0")}`
            : "transparent",
          fontFamily: caption.style.fontFamily,
          fontSize: `${caption.style.fontSize * 0.5}px`,
          fontWeight: caption.style.fontWeight,
          color: caption.style.color,
          WebkitTextStroke: caption.style.strokeWidth
            ? `${caption.style.strokeWidth * 0.5}px ${caption.style.strokeColor}`
            : undefined,
          textShadow: caption.style.shadowBlur
            ? `0 2px ${caption.style.shadowBlur}px ${caption.style.shadowColor}`
            : undefined,
        }}
      >
        {caption.animation === "karaoke" || caption.animation === "highlight-word"
          ? words.map((word, i) => {
              const wordProgress = i / words.length;
              const isHighlighted =
                caption.animation === "karaoke"
                  ? wordProgress <= progress
                  : caption.emphasis.some(
                      (e) => word.toLowerCase().includes(e.toLowerCase())
                    );

              return (
                <span
                  key={i}
                  className="inline-block mr-[0.3em] transition-all duration-200"
                  style={{
                    color: isHighlighted ? "#FFD700" : caption.style.color,
                    transform: isHighlighted ? "scale(1.1)" : "scale(1)",
                    fontWeight: isHighlighted ? 900 : caption.style.fontWeight,
                  }}
                >
                  {word}
                </span>
              );
            })
          : caption.animation === "typewriter"
          ? caption.text.slice(
              0,
              Math.floor(caption.text.length * Math.min(progress * 1.5, 1))
            )
          : words.map((word, i) => {
              const isEmphasis = caption.emphasis.some((e) =>
                word.toLowerCase().includes(e.toLowerCase())
              );
              return (
                <span
                  key={i}
                  className="inline-block mr-[0.3em]"
                  style={{
                    color: isEmphasis ? "#FFD700" : caption.style.color,
                    fontWeight: isEmphasis ? 900 : caption.style.fontWeight,
                    textDecoration: isEmphasis ? "none" : "none",
                  }}
                >
                  {word}
                </span>
              );
            })}
      </span>
    </motion.div>
  );
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
        initial: { opacity: 0, y: 30 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
      };
    case "bounce":
      return {
        initial: { opacity: 0, scale: 0.5, y: 20 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring" as const, damping: 10, stiffness: 200 },
        },
        exit: { opacity: 0, scale: 0.8 },
      };
    case "pop":
      return {
        initial: { opacity: 0, scale: 0.3 },
        animate: {
          opacity: 1,
          scale: 1,
          transition: { type: "spring" as const, damping: 12, stiffness: 300 },
        },
        exit: { opacity: 0, scale: 0.5 },
      };
    case "typewriter":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
    case "karaoke":
      return {
        initial: { opacity: 0, y: 10 },
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
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  }
}
