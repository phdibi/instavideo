"use client";

import { useEffect, useRef, useState } from "react";
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
  const { musicConfig, selectedMusicTrack, isPlaying, modeSegments, videoDuration } =
    useProjectStore(
      useShallow((s) => ({
        musicConfig: s.musicConfig,
        selectedMusicTrack: s.selectedMusicTrack,
        isPlaying: s.isPlaying,
        modeSegments: s.modeSegments,
        videoDuration: s.videoDuration,
      }))
    );

  // currentTime read via ref only — avoids 60fps re-renders
  const currentTimeRef = useRef(0);
  useEffect(() => {
    return useProjectStore.subscribe(
      (s) => { currentTimeRef.current = s.currentTime; }
    );
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const isLoadedRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDuckVolumeRef = useRef(-1);
  const duckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Signal to playback effect that buffer is ready
  const [bufferReady, setBufferReady] = useState(false);

  // Load audio buffer when track changes (with cancellation for race safety)
  useEffect(() => {
    if (!selectedMusicTrack) return;
    const customMusicTracks = useProjectStore.getState().customMusicTracks;
    const track = getTrackById(selectedMusicTrack, customMusicTracks);
    if (!track) return;
    if (isLoadedRef.current === track.id) return;

    let cancelled = false;
    const controller = new AbortController();
    setBufferReady(false);

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
        setBufferReady(true);
      } catch (e) {
        if (!cancelled) console.warn("Failed to load music track:", e);
      }
    };

    loadAudio();
    return () => { cancelled = true; controller.abort(); };
  }, [selectedMusicTrack]);

  // Start/stop playback — re-runs when bufferReady flips to true
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
    } else if (isPlaying && startedRef.current) {
      // Rapid toggle: was fading out, user pressed play again — cancel fade and restore volume
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.linearRampToValueAtTime(
          musicConfig.baseVolume,
          ctx.currentTime + musicConfig.fadeInDuration
        );
      }
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
  }, [isPlaying, selectedMusicTrack, musicConfig, bufferReady]);

  // Ducking based on current mode — interval-based (10Hz), not per-frame
  useEffect(() => {
    if (!isPlaying || !startedRef.current) {
      if (duckIntervalRef.current) {
        clearInterval(duckIntervalRef.current);
        duckIntervalRef.current = null;
      }
      return;
    }

    const tick = () => {
      const ctx = audioCtxRef.current;
      const gain = gainNodeRef.current;
      if (!ctx || !gain || !startedRef.current) return;

      const ct = currentTimeRef.current;
      const mode = getModeAt(modeSegments, ct);
      let targetVolume = musicConfig.baseVolume;

      switch (mode) {
        case "presenter":
          targetVolume = musicConfig.duckVolume;
          break;
        case "broll":
          targetVolume = musicConfig.baseVolume * 0.6;
          break;
        case "typography":
          targetVolume = musicConfig.baseVolume * 0.3;
          break;
      }

      // Fade out at end of video (clamp fade duration to video length)
      const effectiveFadeDur = Math.min(musicConfig.fadeOutDuration, videoDuration);
      if (effectiveFadeDur > 0 && videoDuration > 0 && ct > videoDuration - effectiveFadeDur) {
        const fadeProgress = (videoDuration - ct) / effectiveFadeDur;
        targetVolume *= Math.max(0, fadeProgress);
      }

      // Round to avoid scheduling redundant Web Audio automation events
      const rounded = Math.round(targetVolume * 1000) / 1000;
      if (rounded !== lastDuckVolumeRef.current) {
        lastDuckVolumeRef.current = rounded;
        gain.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.08);
      }
    };

    // Run immediately then at 10Hz
    tick();
    duckIntervalRef.current = setInterval(tick, 100);
    return () => {
      if (duckIntervalRef.current) {
        clearInterval(duckIntervalRef.current);
        duckIntervalRef.current = null;
      }
    };
  }, [isPlaying, modeSegments, musicConfig, videoDuration, bufferReady]);

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
      if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);
      try {
        sourceRef.current?.stop();
        sourceRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch {}
    };
  }, []);

  return null;
}
