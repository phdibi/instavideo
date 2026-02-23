"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { playSFX, disposeSFX } from "@/lib/sfx";

/**
 * SFXController — Triggers cinematic sound effects during video playback.
 *
 * Reads SFX configuration from the store to determine which sounds to play
 * and at what volume. Only plays during active playback (not during scrubbing).
 *
 * Trigger points:
 * - Hook start → "impact" (if hookImpact enabled)
 * - Hook keyword → "rise" (if hookRise enabled)
 * - B-Roll enter → "swoosh-in" (if brollEnter enabled)
 * - B-Roll exit → "swoosh-out" (if brollExit enabled)
 * - Segment type change → "click" (if segmentChange enabled)
 */
export default function SFXController() {
  const { currentTime, isPlaying, segments, bRollImages, sfxConfig } =
    useProjectStore();

  const lastHookTriggered = useRef<string | null>(null);
  const lastBRollTriggered = useRef<string | null>(null);
  const lastBRollExitTriggered = useRef<string | null>(null);
  const lastSegmentPreset = useRef<string | null>(null);
  const lastTriggerTime = useRef(0);

  useEffect(() => {
    return () => {
      disposeSFX();
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || sfxConfig.profile === "none") return;

    const now = Date.now();
    if (now - lastTriggerTime.current < 150) return;

    const vol = sfxConfig.masterVolume;
    const profile = sfxConfig.profile;

    // ── Hook impact ──
    if (sfxConfig.hookImpact && segments && segments.length > 0) {
      const hookSegment = segments.find(
        (s) =>
          s.preset === "hook" &&
          currentTime >= s.startTime &&
          currentTime < s.startTime + 0.25
      );
      if (hookSegment && lastHookTriggered.current !== hookSegment.id) {
        lastHookTriggered.current = hookSegment.id;
        lastTriggerTime.current = now;
        playSFX("impact", vol, profile);
        if (sfxConfig.hookRise) {
          setTimeout(() => playSFX("rise", vol * 0.8, profile), 180);
        }
      }
    }

    // ── B-Roll enter ──
    if (sfxConfig.brollEnter && bRollImages && bRollImages.length > 0) {
      const activeBRoll = bRollImages.find(
        (b) =>
          b.url &&
          currentTime >= b.startTime &&
          currentTime < b.startTime + 0.25
      );
      if (activeBRoll && lastBRollTriggered.current !== activeBRoll.id) {
        lastBRollTriggered.current = activeBRoll.id;
        lastTriggerTime.current = now;
        playSFX("swoosh-in", vol, profile);
      }
    }

    // ── B-Roll exit ──
    if (sfxConfig.brollExit && bRollImages && bRollImages.length > 0) {
      const exitingBRoll = bRollImages.find(
        (b) =>
          b.url &&
          currentTime >= b.endTime - 0.25 &&
          currentTime < b.endTime
      );
      if (exitingBRoll && lastBRollExitTriggered.current !== exitingBRoll.id) {
        lastBRollExitTriggered.current = exitingBRoll.id;
        lastTriggerTime.current = now;
        playSFX("swoosh-out", vol * 0.7, profile);
      }
    }

    // ── Segment type change ──
    if (sfxConfig.segmentChange && segments && segments.length > 0) {
      const currentSegment = segments.find(
        (s) => currentTime >= s.startTime && currentTime < s.endTime
      );
      if (currentSegment) {
        const segKey = `${currentSegment.id}-${currentSegment.preset}`;
        if (
          lastSegmentPreset.current !== null &&
          lastSegmentPreset.current !== segKey
        ) {
          const prevPreset = lastSegmentPreset.current.split("-").pop();
          if (prevPreset !== currentSegment.preset) {
            lastTriggerTime.current = now;
            playSFX("click", vol * 0.6, profile);
          }
        }
        lastSegmentPreset.current = segKey;
      }
    }
  }, [currentTime, isPlaying, segments, bRollImages, sfxConfig]);

  return null;
}
