"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

type TypographyAnimation = "pop-in" | "fade-up" | "typewriter" | "slide-in";

interface Props {
  text: string;
  background: "#F5F0E8" | "#0a0a0a";
  /** Time elapsed since this segment started (seconds) */
  elapsed: number;
  animation?: TypographyAnimation;
  stagger?: number;
}

/**
 * TypographyCard — Mode C fullscreen card with configurable word-by-word animation.
 */
export default function TypographyCard({
  text,
  background,
  elapsed,
  animation = "pop-in",
  stagger = 80,
}: Props) {
  const textColor = background === "#F5F0E8" ? "#0a0a0a" : "#F5F0E8";
  const staggerSec = stagger / 1000;

  const words = useMemo(
    () => text.toUpperCase().split(" ").filter((w) => w.length > 0),
    [text]
  );

  // Typewriter: split into individual characters
  const chars = useMemo(
    () => (animation === "typewriter" ? text.toUpperCase().split("") : []),
    [text, animation]
  );

  const baseStyle: React.CSSProperties = {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "clamp(18px, 8cqw, 56px)",
    fontWeight: 800,
    color: textColor,
    lineHeight: 1.1,
    textAlign: "center",
    letterSpacing: "-0.02em",
  };

  if (animation === "typewriter") {
    const charStagger = staggerSec * 0.3; // faster per-char
    return (
      <div
        className="absolute inset-0 flex items-center justify-center px-8"
        style={{ backgroundColor: background }}
      >
        <div className="flex flex-wrap justify-center max-w-[90%]" style={baseStyle}>
          {chars.map((ch, i) => {
            const charDelay = i * charStagger;
            const isVisible = elapsed >= charDelay;
            return (
              <motion.span
                key={`tc-${i}`}
                initial={{ opacity: 0 }}
                animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.02 }}
                style={{ whiteSpace: ch === " " ? "pre" : undefined }}
              >
                {ch === " " ? "\u00A0" : ch}
              </motion.span>
            );
          })}
          {/* Blinking cursor */}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.6, ease: "linear" }}
            style={{ marginLeft: "2px" }}
          >
            |
          </motion.span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-8"
      style={{ backgroundColor: background }}
    >
      <div className="flex flex-wrap justify-center gap-x-[0.4em] gap-y-2 max-w-[90%]">
        {words.map((word, i) => {
          const wordDelay = i * staggerSec;
          const isVisible = elapsed >= wordDelay;

          const variants = getVariants(animation);

          return (
            <motion.span
              key={`typo-${i}`}
              initial={variants.initial}
              animate={isVisible ? variants.animate : variants.initial}
              transition={variants.transition}
              style={baseStyle}
            >
              {word}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

function getVariants(animation: TypographyAnimation) {
  switch (animation) {
    case "fade-up":
      return {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, damping: 20, stiffness: 300 },
      };
    case "slide-in":
      return {
        initial: { opacity: 0, x: "-100%" },
        animate: { opacity: 1, x: 0 },
        transition: { type: "spring" as const, damping: 20, stiffness: 300 },
      };
    case "pop-in":
    default:
      return {
        initial: { opacity: 0, scale: 0 },
        animate: { opacity: 1, scale: 1 },
        transition: { type: "spring" as const, damping: 15, stiffness: 400 },
      };
  }
}
