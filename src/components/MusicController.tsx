"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { getTrackById } from "@/lib/musicLibrary";
import { getModeAt } from "@/lib/modes";

/**
 * MusicController — Web Audio API playback with ducking per mode.
 * Mode A (presenter/voice): 15% volume
 * Mode B (b-roll): 60% volume
 * Mode C (typography): 30% volume
 */
export default function MusicController() {
  const { musicConfig, selectedMusicTrack, isPlaying, currentTime, modeSegments, videoDuration } =
    useProjectStore(
      useShallow((s) => ({
        musicConfig: s.musicConfig,
        selectedMusicTrack: s.selectedMusicTrack,
        isPlaying: s.isPlaying,
        currentTime: s.currentTime,
        modeSegments: s.modeSegments,
        videoDuration: s.videoDuration,
      }))
    );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const isLoadedRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTimeRef = useRef(currentTime);
  const lastDuckVolumeRef = useRef(-1);

  // Keep currentTimeRef in sync (avoids currentTime in effect deps)
  currentTimeRef.current = currentTime;

  // Load audio buffer when track changes (with cancellation for race safety)
  useEffect(() => {
    if (!selectedMusicTrack) return;
    const track = getTrackById(selectedMusicTrack);
    if (!track) return;
    if (isLoadedRef.current === track.id) return;

    let cancelled = false;
    const controller = new AbortController();

    const loadAudio = async () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
          gainNodeRef.current = audioCtxRef.current.createGain();
          gainNodeRef.current.connect(audioCtxRef.current.destination);
        }

        const response = await fetch(track.file, { signal: controller.signal });
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        bufferRef.current = await audioCtxRef.current.decodeAudioData(arrayBuffer);
        if (cancelled) return;
        isLoadedRef.current = track.id;
      } catch (e) {
        if (!cancelled) console.warn("Failed to load music track:", e);
      }
    };

    loadAudio();
    return () => { cancelled = true; controller.abort(); };
  }, [selectedMusicTrack]);

  // Start/stop playback (no currentTime in deps — use ref instead)
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    const buffer = bufferRef.current;

    if (!ctx || !gain || !buffer || !selectedMusicTrack) return;

    if (isPlaying && !startedRef.current) {
      // Clear any pending fade-out timeout from previous stop
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }

      if (ctx.state === "suspended") ctx.resume();

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(0, currentTimeRef.current % buffer.duration);
      sourceRef.current = source;
      startedRef.current = true;

      // Fade in
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        musicConfig.baseVolume,
        ctx.currentTime + musicConfig.fadeInDuration
      );
    } else if (!isPlaying && startedRef.current) {
      // Stop playback
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      const source = sourceRef.current;
      if (source) {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + musicConfig.fadeOutDuration);
        fadeTimeoutRef.current = setTimeout(() => {
          try { source.stop(); source.disconnect(); } catch {}
          startedRef.current = false;
          fadeTimeoutRef.current = null;
        }, musicConfig.fadeOutDuration * 1000);
      }
    }
  }, [isPlaying, selectedMusicTrack, musicConfig]);

  // Ducking based on current mode — throttled to only update when volume changes
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain || !startedRef.current || !isPlaying) return;

    const mode = getModeAt(modeSegments, currentTime);
    let targetVolume = musicConfig.baseVolume;

    switch (mode) {
      case "presenter":
        targetVolume = musicConfig.duckVolume;
        break;
      case "broll":
        targetVolume = 0.60;
        break;
      case "typography":
        targetVolume = 0.30;
        break;
    }

    // Fade out at end of video (clamp fade duration to video length)
    const effectiveFadeDur = Math.min(musicConfig.fadeOutDuration, videoDuration);
    if (effectiveFadeDur > 0 && videoDuration > 0 && currentTime > videoDuration - effectiveFadeDur) {
      const fadeProgress = (videoDuration - currentTime) / effectiveFadeDur;
      targetVolume *= Math.max(0, fadeProgress);
    }

    // Round to avoid scheduling redundant Web Audio automation events
    const rounded = Math.round(targetVolume * 1000) / 1000;
    if (rounded !== lastDuckVolumeRef.current) {
      lastDuckVolumeRef.current = rounded;
      gain.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.08);
    }
  }, [currentTime, modeSegments, isPlaying, musicConfig, videoDuration]);

  // Resume AudioContext when returning from background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const ctx = audioCtxRef.current;
      if (ctx?.state === "suspended") {
        ctx.resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      try {
        sourceRef.current?.stop();
        sourceRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch {}
    };
  }, []);

  return null;
}
