"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Download } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";
import CaptionOverlay from "./CaptionOverlay";
import { useState } from "react";

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [muted, setMuted] = useState(false);

  // Synchronous flag — set immediately on play/pause, not subject to React batching.
  // This is the SINGLE source of truth for whether we're in playback mode.
  const isPlayingRef = useRef(false);

  const {
    videoUrl,
    videoDuration,
    currentTime,
    isPlaying,
    effects,
    bRollImages,
    setCurrentTime,
    setIsPlaying,
    setVideoDuration,
  } = useProjectStore();

  // ── SEEK SYNC ───────────────────────────────────────────────────────
  // Syncs the <video> element to match the store's currentTime.
  // ONLY runs when NOT playing. During playback, the RAF loop is the
  // single writer of currentTime → there is nothing to sync.
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    // Only the VISIBLE instance should sync — skip if hidden (display:none)
    const container = containerRef.current;
    if (!container || container.offsetParent === null) return;

    // Guard: NEVER seek the video element during playback.
    if (isPlayingRef.current || !vid.paused) return;

    const diff = Math.abs(vid.currentTime - currentTime);
    if (diff > 0.05 && !seekingRef.current) {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = setTimeout(() => {
        const v = videoRef.current;
        if (v && !seekingRef.current && !isPlayingRef.current && v.paused && v.readyState >= 2) {
          seekingRef.current = true;
          v.currentTime = currentTime;
          const onSeeked = () => {
            seekingRef.current = false;
            v.removeEventListener("seeked", onSeeked);
          };
          v.addEventListener("seeked", onSeeked);
          setTimeout(() => { seekingRef.current = false; }, 500);
        }
      }, 60);
    }

    return () => {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    };
  }, [currentTime]); // Intentionally omit isPlaying — we use the ref instead

  // ── RAF PLAYBACK LOOP ───────────────────────────────────────────────
  // Reads vid.currentTime → writes to the store at ~30fps.
  // This is the ONLY writer of currentTime during playback.
  const lastUpdateRef = useRef(0);
  // Use a ref for videoDuration so updateTime doesn't need it as a dep
  // (avoids callback identity change when WebM blobs update their duration)
  const videoDurationRef = useRef(videoDuration);
  videoDurationRef.current = videoDuration;

  const updateTime = useCallback(() => {
    if (!isPlayingRef.current) return;

    // Only the VISIBLE instance drives currentTime
    const container = containerRef.current;
    if (!container || container.offsetParent === null) return;

    const vid = videoRef.current;
    if (!vid) return;

    const now = performance.now();
    if (now - lastUpdateRef.current >= 33) {
      const dur = videoDurationRef.current;
      // Compensate for browser audio decode buffering:
      // vid.currentTime reports the decoded position, which is slightly
      // ahead of the audio that's actually being heard (~50ms).
      const AUDIO_SYNC_COMPENSATION = 0.05; // 50ms
      const raw = (dur && dur > 0 && Number.isFinite(dur))
        ? Math.min(vid.currentTime, dur)
        : vid.currentTime;
      const t = Math.max(0, raw - AUDIO_SYNC_COMPENSATION);
      setCurrentTime(t);
      lastUpdateRef.current = now;
    }

    animFrameRef.current = requestAnimationFrame(updateTime);
  }, [setCurrentTime]); // Only stable dep

  // Start/stop RAF loop when isPlaying changes — ONLY for visible instance
  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.offsetParent === null) return;

    if (isPlaying) {
      lastUpdateRef.current = 0; // Force immediate first update
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [isPlaying, updateTime]);

  // ── EFFECTS, B-ROLL, VISUAL OVERLAYS ─────────────────────────────────

  // Find active effects at current time
  const activeEffects = useMemo(
    () =>
      effects.filter(
        (e) => currentTime >= e.startTime && currentTime <= e.endTime
      ),
    [effects, currentTime]
  );

  // Find active B-roll at current time
  const activeBRoll = useMemo(
    () =>
      bRollImages.find(
        (b) => b.url && currentTime >= b.startTime && currentTime <= b.endTime
      ),
    [bRollImages, currentTime]
  );

  // B-Roll animation: respects the `animation` property chosen in the sidebar
  const bRollStyle = useMemo(() => {
    if (!activeBRoll) return null;
    const duration = activeBRoll.endTime - activeBRoll.startTime;
    const progress = Math.min(
      Math.max((currentTime - activeBRoll.startTime) / duration, 0),
      1
    );

    // Fade in/out envelope for all animations
    let opacity = activeBRoll.opacity ?? 1;
    if (progress < 0.15) {
      opacity *= progress / 0.15;
    } else if (progress > 0.85) {
      opacity *= (1 - progress) / 0.15;
    }

    let scale = 1;
    let translateX = 0;
    let translateY = 0;

    const animation = activeBRoll.animation || "ken-burns";

    switch (animation) {
      case "fade":
        // Pure fade — no movement
        break;
      case "slide":
        // Horizontal pan from left to right
        translateX = (progress - 0.5) * -6; // -3% to +3%
        break;
      case "zoom":
        // Smooth zoom in
        scale = 1 + progress * 0.2;
        break;
      case "ken-burns":
      default:
        // Classic ken-burns: zoom + pan
        scale = 1 + progress * 0.12;
        translateX = progress * -2;
        translateY = progress * -1;
        break;
    }

    return {
      opacity,
      transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
      backgroundImage: `url(${activeBRoll.url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      transition: "opacity 0.2s ease",
    };
  }, [activeBRoll, currentTime]);

  // Compute transform style based on active effects
  const videoStyle = useMemo(() => {
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let filter = "";
    let clipPath = "";

    for (const effect of activeEffects) {
      const rawProgress =
        (currentTime - effect.startTime) / (effect.endTime - effect.startTime);
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      const params = effect.params as Record<string, number | string>;

      switch (effect.type) {
        case "zoom-in": {
          const targetScale = (params.scale as number) || 1.3;
          const eased = easeOutCubic(progress);
          scale *= 1 + (targetScale - 1) * eased;
          const focusX = ((params.focusX as number) || 0.5) - 0.5;
          const focusY = ((params.focusY as number) || 0.4) - 0.5;
          translateX -= focusX * (scale - 1) * 100;
          translateY -= focusY * (scale - 1) * 100;
          break;
        }
        case "zoom-out": {
          const targetScale = (params.scale as number) || 1.3;
          const eased = easeOutCubic(progress);
          scale *= targetScale - (targetScale - 1) * eased;
          break;
        }
        case "zoom-pulse": {
          const targetScale = (params.scale as number) || 1.2;
          const pulse = Math.sin(progress * Math.PI);
          const smoothed = easeInOutQuad(pulse);
          scale *= 1 + (targetScale - 1) * smoothed;
          break;
        }
        case "pan-left":
          translateX -= ((params.distance as number) || 30) * easeInOutCubic(progress);
          break;
        case "pan-right":
          translateX += ((params.distance as number) || 30) * easeInOutCubic(progress);
          break;
        case "pan-up":
          translateY -= ((params.distance as number) || 20) * easeInOutCubic(progress);
          break;
        case "pan-down":
          translateY += ((params.distance as number) || 20) * easeInOutCubic(progress);
          break;
        case "shake": {
          const intensity = (params.intensity as number) || 3;
          const freq = (params.frequency as number) || 15;
          const decay = 1 - progress * 0.6;
          translateX += Math.sin(progress * freq * Math.PI * 2) * intensity * decay;
          translateY +=
            Math.cos(progress * freq * Math.PI * 2 + 1) * intensity * decay;
          break;
        }
        case "vignette":
          break;
        case "letterbox":
          clipPath = `inset(${((params.amount as number) || 0.1) * 100}% 0)`;
          break;
        case "blur-background":
          break;
        case "color-grade": {
          const preset = params.preset as string;
          if (preset === "cinematic-warm")
            filter += " sepia(0.12) saturate(1.15) contrast(1.08)";
          else if (preset === "cold-thriller")
            filter += " saturate(0.8) hue-rotate(200deg) contrast(1.15)";
          else if (preset === "vintage")
            filter += " sepia(0.3) saturate(0.9) contrast(1.05)";
          else if (preset === "high-contrast")
            filter += " contrast(1.4) saturate(1.1)";
          break;
        }
        case "flash": {
          const flashProgress = 1 - progress;
          if (flashProgress > 0.5) filter += ` brightness(${1 + flashProgress * 2})`;
          break;
        }
        case "slow-motion":
        case "speed-ramp":
          break;
      }
    }

    return {
      transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
      filter: filter || undefined,
      clipPath: clipPath || undefined,
      willChange: "transform, filter",
    };
  }, [activeEffects, currentTime]);

  // Vignette effect
  const vignetteEffect = useMemo(() => {
    const vignette = activeEffects.find((e) => e.type === "vignette");
    if (!vignette) return null;
    const intensity = (vignette.params.intensity as number) || 0.3;
    return {
      background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${intensity}) 100%)`,
    };
  }, [activeEffects]);

  // Transition effects
  const transitionOverlay = useMemo(() => {
    const transition = activeEffects.find((e) =>
      e.type.startsWith("transition-")
    );
    if (!transition) return null;
    const progress =
      (currentTime - transition.startTime) /
      (transition.endTime - transition.startTime);

    switch (transition.type) {
      case "transition-fade":
        return {
          backgroundColor: `rgba(0,0,0,${Math.sin(progress * Math.PI) * 0.7})`,
        };
      case "transition-glitch": {
        const glitchR = Math.abs(Math.sin(progress * 127.1)) * 255;
        const glitchB = Math.abs(Math.sin(progress * 269.5)) * 255;
        return {
          backgroundColor: `rgba(${glitchR},0,${glitchB},${Math.sin(progress * Math.PI) * 0.3})`,
          mixBlendMode: "screen" as const,
        };
      }
      case "transition-zoom":
        return {
          backgroundColor: `rgba(255,255,255,${Math.sin(progress * Math.PI) * 0.5
            })`,
        };
      default:
        return null;
    }
  }, [activeEffects, currentTime]);

  // ── PLAY/PAUSE/SEEK CONTROLS ──────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      // Set BOTH ref AND state IMMEDIATELY — don't wait for play() promise.
      // This ensures the RAF loop starts on the next render cycle.
      isPlayingRef.current = true;
      setIsPlaying(true);
      vid.play().catch(() => {
        // Play failed (e.g., autoplay policy) — revert
        isPlayingRef.current = false;
        setIsPlaying(false);
      });
    } else {
      isPlayingRef.current = false;
      vid.pause();
      setIsPlaying(false);
    }
  }, [setIsPlaying]);

  const restart = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    isPlayingRef.current = false;
    vid.pause();
    vid.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, [setCurrentTime, setIsPlaying]);

  const seekTo = useCallback(
    (time: number) => {
      const vid = videoRef.current;
      if (!vid) return;
      vid.currentTime = time;
      setCurrentTime(time);
    },
    [setCurrentTime]
  );

  // ── SPACEBAR PLAY/PAUSE ────────────────────────────────────────────
  // NOTE: VideoPreview is mounted TWICE in EditorLayout (desktop + mobile).
  // Only the *visible* instance should handle spacebar to avoid double-fire.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;

      // Only handle if THIS instance is visible (not display:none from responsive CSS)
      const container = containerRef.current;
      if (!container || container.offsetParent === null) return;

      // Don't intercept if user is typing in an input, textarea, or contentEditable
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Blur any focused button to prevent native keyup → click
      if (active instanceof HTMLButtonElement) {
        active.blur();
      }

      togglePlay();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const container = containerRef.current;
      if (!container || container.offsetParent === null) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [togglePlay]);

  return (
    <div className="flex flex-col h-full">
      {/* Video Container */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-black rounded-xl overflow-hidden mx-2 mt-2 md:mx-4 md:mt-4"
      >
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            style={videoStyle}
            onLoadedMetadata={(e) => {
              const vid = e.target as HTMLVideoElement;
              if (Number.isFinite(vid.duration) && vid.duration > 0) {
                setVideoDuration(vid.duration);
              }
            }}
            onDurationChange={(e) => {
              // WebM blobs may update duration after initial load
              const vid = e.target as HTMLVideoElement;
              if (Number.isFinite(vid.duration) && vid.duration > 0 && vid.duration !== videoDuration) {
                setVideoDuration(vid.duration);
              }
            }}
            onEnded={() => {
              isPlayingRef.current = false;
              setIsPlaying(false);
            }}
            muted={muted}
            playsInline
          />

          {/* B-Roll overlay - FULLY OPAQUE with ken-burns effect */}
          {activeBRoll && bRollStyle && (
            <div
              className="absolute inset-0 z-10"
              style={bRollStyle}
            />
          )}

          {/* Vignette overlay */}
          {vignetteEffect && (
            <div className="absolute inset-0 z-20 pointer-events-none" style={vignetteEffect} />
          )}

          {/* Transition overlay */}
          {transitionOverlay && (
            <div
              className="absolute inset-0 z-30 pointer-events-none"
              style={transitionOverlay}
            />
          )}

          {/* Letterbox bars */}
          {activeEffects.some((e) => e.type === "letterbox") && (
            <>
              <div className="absolute top-0 left-0 right-0 h-[10%] bg-black z-20" />
              <div className="absolute bottom-0 left-0 right-0 h-[10%] bg-black z-20" />
            </>
          )}
        </div>

        {/* Click to play/pause - z-40 */}
        <div
          className="absolute inset-0 z-40 cursor-pointer"
          onClick={togglePlay}
        />

        {/* Caption overlay - z-50, MUST be after click handler to render on top */}
        <div className="absolute inset-0 z-50 pointer-events-none">
          <CaptionOverlay currentTime={currentTime} />
        </div>
      </div>

      {/* Controls */}
      <div className="px-2 py-2 md:px-4 md:py-3 space-y-1.5 md:space-y-2">
        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={videoDuration || 100}
          step={0.01}
          value={currentTime}
          onChange={(e) => seekTo(parseFloat(e.target.value))}
          className="w-full"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-white" />
              ) : (
                <Play className="w-4 h-4 text-white ml-0.5" />
              )}
            </button>
            <button
              onClick={restart}
              className="w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMuted(!muted)}
              className="w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            {/* Download original video */}
            {videoUrl && (
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = videoUrl;
                  a.download = "video-original.webm";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
                title="Baixar vídeo original"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>

          <span className="text-sm text-[var(--text-secondary)] font-mono">
            {formatTime(currentTime)} / {formatTime(videoDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Smooth easing functions for fluid effects
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
