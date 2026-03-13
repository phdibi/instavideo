"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface Props {
  text: string;
  background: "#F5F0E8" | "#0a0a0a";
  /** Time elapsed since this segment started (seconds) */
  elapsed: number;
}

/**
 * TypographyCard — Mode C fullscreen card with word-by-word animation.
 * Spring physics: damping 15, stiffness 400.
 * Stagger: 80ms per word.
 */
export default function TypographyCard({ text, background, elapsed }: Props) {
  const textColor = background === "#F5F0E8" ? "#0a0a0a" : "#F5F0E8";
  const words = useMemo(() => text.toUpperCase().split(" ").filter((w) => w.length > 0), [text]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-8"
      style={{ backgroundColor: background }}
    >
      <div className="flex flex-wrap justify-center gap-x-[0.4em] gap-y-2 max-w-[90%]">
        {words.map((word, i) => {
          // Each word appears after stagger delay
          const wordDelay = i * 0.08; // 80ms stagger
          const isVisible = elapsed >= wordDelay;

          return (
            <motion.span
              key={`typo-${i}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={
                isVisible
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 0, scale: 0 }
              }
              transition={{
                type: "spring",
                damping: 15,
                stiffness: 400,
              }}
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "clamp(40px, 8vw, 72px)",
                fontWeight: 800,
                color: textColor,
                lineHeight: 1.1,
                textAlign: "center",
                letterSpacing: "-0.02em",
              }}
            >
              {word}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}
