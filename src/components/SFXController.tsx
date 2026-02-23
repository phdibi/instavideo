"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { playSFX, disposeSFX } from "@/lib/sfx";

/**
 * SFXController — Triggers cinematic sound effects during video playback.
 *
 * Monitors currentTime and detects element transitions to play
 * appropriate sounds:
 *
 * - Hook start → "impact" + "rise" (cinematic punch + keyword reveal)
 * - B-Roll slide-in → "swoosh-in" (element entering)
 * - B-Roll slide-out → "swoosh-out" (element leaving)
 * - Segment type change → "click" (subtle transition accent)
 *
 * Sounds only play during playback (not during scrubbing).
 * Debounced to avoid rapid-fire triggers.
 */
export default function SFXController() {
  const { currentTime, isPlaying, segments, bRollImages } = useProjectStore();

  // Track what we've already triggered to avoid re-firing
  const lastHookTriggered = useRef<string | null>(null);
  const lastBRollTriggered = useRef<string | null>(null);
  const lastBRollExitTriggered = useRef<string | null>(null);
  const lastSegmentPreset = useRef<string | null>(null);
  const lastTriggerTime = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposeSFX();
    };
  }, []);

  useEffect(() => {
    // Only trigger SFX during playback
    if (!isPlaying) return;

    const now = Date.now();
    // Global debounce: minimum 100ms between any SFX triggers
    if (now - lastTriggerTime.current < 100) return;

    // ── Hook start: impact + rise ──
    if (segments && segments.length > 0) {
      const hookSegment = segments.find(
        (s) =>
          s.preset === "hook" &&
          currentTime >= s.startTime &&
          currentTime < s.startTime + 0.3
      );
      if (hookSegment && lastHookTriggered.current !== hookSegment.id) {
        lastHookTriggered.current = hookSegment.id;
        lastTriggerTime.current = now;
        playSFX("impact", 0.12);
        // Delayed rise for keyword reveal
        setTimeout(() => playSFX("rise", 0.1), 200);
      }
    }

    // ── B-Roll enter: swoosh-in ──
    if (bRollImages && bRollImages.length > 0) {
      const activeBRoll = bRollImages.find(
        (b) =>
          b.url &&
          currentTime >= b.startTime &&
          currentTime < b.startTime + 0.3
      );
      if (activeBRoll && lastBRollTriggered.current !== activeBRoll.id) {
        lastBRollTriggered.current = activeBRoll.id;
        lastTriggerTime.current = now;
        playSFX("swoosh-in", 0.12);
      }

      // ── B-Roll exit: swoosh-out ──
      const exitingBRoll = bRollImages.find(
        (b) =>
          b.url &&
          currentTime >= b.endTime - 0.3 &&
          currentTime < b.endTime
      );
      if (exitingBRoll && lastBRollExitTriggered.current !== exitingBRoll.id) {
        lastBRollExitTriggered.current = exitingBRoll.id;
        lastTriggerTime.current = now;
        playSFX("swoosh-out", 0.08);
      }
    }

    // ── Segment type change: click ──
    if (segments && segments.length > 0) {
      const currentSegment = segments.find(
        (s) => currentTime >= s.startTime && currentTime < s.endTime
      );
      if (currentSegment) {
        const segKey = `${currentSegment.id}-${currentSegment.preset}`;
        if (
          lastSegmentPreset.current !== null &&
          lastSegmentPreset.current !== segKey
        ) {
          // Only play if the preset type actually changed (not just a different segment of same type)
          const prevPreset = lastSegmentPreset.current.split("-").pop();
          if (prevPreset !== currentSegment.preset) {
            lastTriggerTime.current = now;
            playSFX("click", 0.08);
          }
        }
        lastSegmentPreset.current = segKey;
      }
    }
  }, [currentTime, isPlaying, segments, bRollImages]);

  // This component renders nothing — it's purely a side-effect controller
  return null;
}
