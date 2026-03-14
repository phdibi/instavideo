"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import { getFontValue } from "@/lib/fonts";
import type { PhraseCaption, CaptionConfig, StanzaConfig } from "@/types";

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
 * Supports stacked stanza display (multiple words with mixed typography).
 */
export default function CaptionOverlay({ currentTime }: Props) {
  const { phraseCaptions, captionConfig, stanzaConfig } = useProjectStore();

  // Find ALL active captions at current time
  const activeCaptions = useMemo(() => {
    return phraseCaptions.filter(
      (c) => currentTime >= c.startTime && currentTime < c.endTime
    );
  }, [phraseCaptions, currentTime]);

  // Check if active captions form a stanza (multiple captions with same stanzaId)
  const isStanza = activeCaptions.length > 1 && activeCaptions[0]?.stanzaId;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {isStanza ? (
          <StanzaDisplay
            key={activeCaptions[0].stanzaId!}
            captions={activeCaptions}
            config={captionConfig}
            stanzaConfig={stanzaConfig}
          />
        ) : activeCaptions[0] ? (
          <PhraseDisplay
            key={activeCaptions[0].id}
            caption={activeCaptions[0]}
            config={captionConfig}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Animation variants — hoisted to avoid per-render allocations
const CASCADING_INITIAL = { opacity: 0, x: -12 };
const CASCADING_ANIMATE = { opacity: 1, x: 0 };
const CENTERED_INITIAL = { opacity: 0, y: 8 };
const CENTERED_ANIMATE = { opacity: 1, y: 0 };
const CENTERED_TRANSITION = { duration: 0.15 };

/** Stacked stanza display — multiple words stacked vertically with mixed typography */
function StanzaDisplay({ captions, config, stanzaConfig }: { captions: PhraseCaption[]; config: CaptionConfig; stanzaConfig: StanzaConfig }) {
  const isCascading = stanzaConfig.stanzaLayout === "cascading";
  const positionClass = isCascading ? "bottom-[12%]" : getPositionClass(config.position);
  const emphFamily = getFontValue(stanzaConfig.emphasisFontFamily);
  const normalFamily = getFontValue(stanzaConfig.normalFontFamily);
  const emphFontSize = isCascading
    ? stanzaConfig.emphasisFontSize * 1.2
    : stanzaConfig.emphasisFontSize;

  return (
    <motion.div
      className={`absolute left-0 right-0 ${positionClass} px-4 ${isCascading ? "flex justify-start" : "flex justify-center"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      layout
    >
      <div className={`flex flex-col ${isCascading ? "items-start" : "items-center"} gap-0`}>
        {captions.map((caption, index) => {
          const indent = isCascading
            ? Math.min(index * 28 + (caption.isEmphasis ? -8 : 0), 200)
            : 0;

          return (
            <motion.span
              key={caption.id}
              initial={isCascading ? CASCADING_INITIAL : CENTERED_INITIAL}
              animate={isCascading ? CASCADING_ANIMATE : CENTERED_ANIMATE}
              transition={isCascading
                ? { duration: 0.15, delay: index * 0.04 }
                : CENTERED_TRANSITION
              }
              style={{
                marginLeft: isCascading ? `${indent}px` : undefined,
                fontSize: caption.isEmphasis
                  ? `clamp(28px, 7cqw, ${emphFontSize}px)`
                  : `clamp(16px, 4cqw, ${stanzaConfig.normalFontSize}px)`,
                fontWeight: caption.isEmphasis ? 700 : 400,
                fontStyle: caption.isEmphasis ? 'italic' : 'normal',
                fontFamily: caption.isEmphasis ? emphFamily : normalFamily,
                color: '#FFFFFF',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                lineHeight: 1.1,
              }}
            >
              {config.uppercase ? caption.text.toUpperCase() : caption.text}
            </motion.span>
          );
        })}
      </div>
    </motion.div>
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
