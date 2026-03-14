"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import { getFontValue } from "@/lib/fonts";
import type { PhraseCaption, CaptionConfig } from "@/types";

interface Props {
  currentTime: number;
}

function getAnimationVariants(animation: CaptionConfig["animation"]) {
  switch (animation) {
    case "fade":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      };
    case "pop":
      return {
        initial: { opacity: 0, scale: 0.7 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.08, ease: [0.34, 1.56, 0.64, 1] as const },
      };
    case "slide-up":
      return {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
        transition: { duration: 0.1, ease: "easeOut" as const },
      };
    case "typewriter":
      return {
        initial: { opacity: 0, scaleX: 0.85 },
        animate: { opacity: 1, scaleX: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.08 },
      };
    case "none":
    default:
      return {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.02 },
      };
  }
}

function getPositionClass(position: CaptionConfig["position"]) {
  switch (position) {
    case "top":
      return "top-[15%]";
    case "center":
      return "top-[45%]";
    case "bottom":
    default:
      return "bottom-[15%]";
  }
}

/**
 * CaptionOverlay — Phrase-based captions (2-4 words).
 * Reads captionConfig from store for full customization.
 * Uses mode="sync" to avoid gaps between captions.
 */
export default function CaptionOverlay({ currentTime }: Props) {
  const { phraseCaptions, captionConfig } = useProjectStore();

  const activeCaption = useMemo(() => {
    return phraseCaptions.find(
      (c) => currentTime >= c.startTime && currentTime < c.endTime
    ) || null;
  }, [phraseCaptions, currentTime]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {activeCaption && (
          <PhraseDisplay
            key={activeCaption.id}
            caption={activeCaption}
            config={captionConfig}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PhraseDisplay({ caption, config }: { caption: PhraseCaption; config: CaptionConfig }) {
  const anim = getAnimationVariants(config.animation);
  const positionClass = getPositionClass(config.position);
  const displayText = config.uppercase ? caption.text.toUpperCase() : caption.text;

  const strokeStyle: React.CSSProperties = config.strokeWidth > 0
    ? { WebkitTextStroke: `${config.strokeWidth}px ${config.strokeColor}` }
    : {};

  return (
    <motion.div
      className={`absolute left-0 right-0 ${positionClass} px-4 flex justify-center`}
      initial={anim.initial}
      animate={anim.animate}
      exit={anim.exit}
      transition={anim.transition}
      layout
    >
      <span
        style={{
          fontFamily: getFontValue(config.fontFamily),
          fontSize: `clamp(14px, 4.5cqw, ${config.fontSize}px)`,
          fontWeight: config.fontWeight,
          color: config.color,
          textShadow: `0 2px ${config.shadowBlur}px ${config.shadowColor}`,
          lineHeight: 1.2,
          textAlign: "center",
          letterSpacing: `${config.letterSpacing}em`,
          wordBreak: "break-word",
          maxWidth: "100%",
          ...strokeStyle,
        }}
      >
        {displayText}
      </span>
    </motion.div>
  );
}
