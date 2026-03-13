"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
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
    useProjectStore();

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const isLoadedRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  // Load audio buffer when track changes
  useEffect(() => {
    if (!selectedMusicTrack) return;
    const track = getTrackById(selectedMusicTrack);
    if (!track) return;
    if (isLoadedRef.current === track.id) return;

    const loadAudio = async () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
          gainNodeRef.current = audioCtxRef.current.createGain();
          gainNodeRef.current.connect(audioCtxRef.current.destination);
        }

        const response = await fetch(track.file);
        const arrayBuffer = await response.arrayBuffer();
        bufferRef.current = await audioCtxRef.current.decodeAudioData(arrayBuffer);
        isLoadedRef.current = track.id;
      } catch (e) {
        console.warn("Failed to load music track:", e);
      }
    };

    loadAudio();
  }, [selectedMusicTrack]);

  // Start/stop playback
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    const buffer = bufferRef.current;

    if (!ctx || !gain || !buffer || !selectedMusicTrack) return;

    if (isPlaying && !startedRef.current) {
      // Start playback
      if (ctx.state === "suspended") ctx.resume();

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(0, currentTime % buffer.duration);
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
      const source = sourceRef.current;
      if (source) {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + musicConfig.fadeOutDuration);
        setTimeout(() => {
          try { source.stop(); } catch {}
          startedRef.current = false;
        }, musicConfig.fadeOutDuration * 1000);
      }
    }
  }, [isPlaying, selectedMusicTrack, musicConfig, currentTime]);

  // Ducking based on current mode
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain || !startedRef.current || !isPlaying) return;

    const mode = getModeAt(modeSegments, currentTime);
    let targetVolume = musicConfig.baseVolume;

    switch (mode) {
      case "presenter":
        targetVolume = musicConfig.duckVolume; // 15% — voice takes priority
        break;
      case "broll":
        targetVolume = 0.60; // 60% — no voice, music can be louder
        break;
      case "typography":
        targetVolume = 0.30; // 30% — medium
        break;
    }

    // Fade out at end of video
    if (videoDuration > 0 && currentTime > videoDuration - musicConfig.fadeOutDuration) {
      const fadeProgress = (videoDuration - currentTime) / musicConfig.fadeOutDuration;
      targetVolume *= Math.max(0, fadeProgress);
    }

    gain.gain.linearRampToValueAtTime(targetVolume, ctx.currentTime + 0.3);
  }, [currentTime, modeSegments, isPlaying, musicConfig, videoDuration]);

  // Cleanup
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
        audioCtxRef.current?.close();
      } catch {}
    };
  }, []);

  return null; // No visual output
}
