"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { formatTime } from "@/lib/formatTime";
import { getCurrentMode } from "@/lib/modes";
import { computeBRollEffect, computePresenterEffect, effectToCSS } from "@/lib/brollEffects";
import { SFX_PLAY_MAP } from "@/lib/sfx";
import CaptionOverlay from "./CaptionOverlay";
import TypographyCard from "./TypographyCard";

// Fixed reference resolution for consistent preview layout (9:16)
const REF_WIDTH = 720;
const REF_HEIGHT = 1280;

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const brollVideoRef = useRef<HTMLVideoElement>(null);
  const brollPreloadRef = useRef<HTMLVideoElement>(null);
  const brollImageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const [muted, setMuted] = useState(false);
  const [containerScale, setContainerScale] = useState(0.5);
  const isPlayingRef = useRef(false);

  const {
    videoUrl,
    videoDuration,
    currentTime,
    isPlaying,
    modeSegments,
    sfxConfig,
    sfxMarkers,
    setCurrentTime,
    setIsPlaying,
    setVideoDuration,
  } = useProjectStore(useShallow((s) => ({
    videoUrl: s.videoUrl,
    videoDuration: s.videoDuration,
    currentTime: s.currentTime,
    isPlaying: s.isPlaying,
    modeSegments: s.modeSegments,
    sfxConfig: s.sfxConfig,
    sfxMarkers: s.sfxMarkers,
    setCurrentTime: s.setCurrentTime,
    setIsPlaying: s.setIsPlaying,
    setVideoDuration: s.setVideoDuration,
  })));

  // ResizeObserver to compute scale for fixed-resolution preview
  useEffect(() => {
    const outer = outerContainerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setContainerScale(Math.min(width / REF_WIDTH, height / REF_HEIGHT));
      }
    });
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  // Current mode segment
  const currentSegment = useMemo(
    () => getCurrentMode(modeSegments, currentTime),
    [modeSegments, currentTime]
  );

  const currentMode = currentSegment?.mode || "presenter";
  const brollLayout = currentSegment?.brollLayout || "fullscreen";

  // ── SFX Marker Playback ────────────────────────────────────────────
  const firedMarkersRef = useRef<Set<string>>(new Set());

  // Clear fired markers when sfxMarkers array changes (segment deleted, markers regenerated)
  const sfxMarkersLenRef = useRef(sfxMarkers.length);
  useEffect(() => {
    if (sfxMarkers.length !== sfxMarkersLenRef.current) {
      firedMarkersRef.current.clear();
      sfxMarkersLenRef.current = sfxMarkers.length;
    }
  }, [sfxMarkers]);

  useEffect(() => {
    if (!isPlayingRef.current || sfxConfig.profile === "none") return;
    // Binary search for first marker >= currentTime - 0.05
    const lo = currentTime - 0.05;
    const hi = currentTime + 0.05;
    let left = 0, right = sfxMarkers.length - 1;
    while (left <= right) {
      const mid = (left + right) >>> 1;
      if (sfxMarkers[mid].time < lo) left = mid + 1;
      else right = mid - 1;
    }
    // Scan only markers in the time window
    for (let i = left; i < sfxMarkers.length && sfxMarkers[i].time <= hi; i++) {
      const marker = sfxMarkers[i];
      if (!firedMarkersRef.current.has(marker.id)) {
        firedMarkersRef.current.add(marker.id);
        SFX_PLAY_MAP[marker.soundType](sfxConfig.masterVolume);
      }
    }
  }, [currentTime, sfxMarkers, sfxConfig.profile, sfxConfig.masterVolume]);

  // ── SEEK SYNC ───────────────────────────────────────────────────────
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const container = containerRef.current;
    if (!container || container.offsetParent === null) return;
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
  }, [currentTime]);

  // ── RAF PLAYBACK LOOP ───────────────────────────────────────────────
  const videoDurationRef = useRef(videoDuration);
  videoDurationRef.current = videoDuration;
  const lastWrittenTimeRef = useRef(-1);

  const updateTime = useCallback(() => {
    if (!isPlayingRef.current) return;
    const container = containerRef.current;
    if (!container || container.offsetParent === null) return;
    const vid = videoRef.current;
    if (!vid) return;

    const dur = videoDurationRef.current;
    const raw = (dur && dur > 0 && Number.isFinite(dur))
      ? Math.min(vid.currentTime, dur)
      : vid.currentTime;

    if (Math.abs(raw - lastWrittenTimeRef.current) > 0.001) {
      setCurrentTime(raw);
      lastWrittenTimeRef.current = raw;
    }

    animFrameRef.current = requestAnimationFrame(updateTime);
  }, [setCurrentTime]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.offsetParent === null) return;

    if (isPlaying) {
      lastWrittenTimeRef.current = -1;
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [isPlaying, updateTime]);

  // ── B-ROLL MEDIA MANAGEMENT (video or photo) ───────────────────────
  const prevBrollUrlRef = useRef<string | null>(null);
  const prevBrollImageUrlRef = useRef<string | null>(null);
  const prevBrollSegmentIdRef = useRef<string | null>(null);
  const preloadedUrlRef = useRef<string | null>(null);

  const brollIsPhoto = currentSegment?.brollMediaType === "photo";

  // Find the next upcoming b-roll segment for preloading
  // Also looks ahead during b-roll mode (for consecutive b-rolls)
  const nextBrollSegment = useMemo(() => {
    const searchFrom = (currentMode === "broll" && currentSegment)
      ? currentSegment.endTime
      : currentTime;
    return modeSegments.find(
      (s) => s.mode === "broll" && s.startTime >= searchFrom && s.id !== currentSegment?.id && (s.brollVideoUrl || s.brollImageUrl)
    ) || null;
  }, [modeSegments, currentTime, currentMode, currentSegment]);

  // Eagerly preload the b-roll AFTER next (2 segments ahead) using browser cache
  const secondNextBroll = useMemo(() => {
    if (!nextBrollSegment) return null;
    return modeSegments.find(
      (s) => s.mode === "broll" && s.startTime >= nextBrollSegment.endTime && s.id !== nextBrollSegment.id && (s.brollVideoUrl || s.brollImageUrl)
    ) || null;
  }, [modeSegments, nextBrollSegment]);

  useEffect(() => {
    if (!secondNextBroll?.brollVideoUrl) return;
    // Warm browser cache via hidden preload element link
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = secondNextBroll.brollVideoUrl;
    link.as = "video";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [secondNextBroll?.brollVideoUrl]);

  // Preload upcoming b-roll media (set src before segment becomes active)
  // During b-roll mode: uses hidden preload element to warm cache without interrupting playback
  useEffect(() => {
    if (!nextBrollSegment) return;

    if (nextBrollSegment.brollMediaType === "photo" && nextBrollSegment.brollImageUrl) {
      if (currentMode !== "broll") {
        // During presenter: preload directly into display element (original behavior)
        const brollImg = brollImageRef.current;
        if (brollImg && brollImg.src !== nextBrollSegment.brollImageUrl) {
          brollImg.src = nextBrollSegment.brollImageUrl;
        }
      } else {
        // During b-roll: cache-warm without touching active display element
        const preImg = new Image();
        preImg.src = nextBrollSegment.brollImageUrl;
      }
    } else if (nextBrollSegment.brollVideoUrl) {
      // During b-roll: preload into hidden element; during presenter: preload into main element
      const target = currentMode === "broll" ? brollPreloadRef.current : brollVideoRef.current;
      const trackRef = currentMode === "broll" ? preloadedUrlRef : prevBrollUrlRef;
      if (target && trackRef.current !== nextBrollSegment.brollVideoUrl) {
        target.src = nextBrollSegment.brollVideoUrl;
        target.load();
        trackRef.current = nextBrollSegment.brollVideoUrl;
      }
    }
  }, [nextBrollSegment, currentMode]);

  // Active b-roll: set src + play/pause
  useEffect(() => {
    const brollVid = brollVideoRef.current;
    if (!brollVid) return;

    if (currentMode === "broll" && currentSegment?.brollVideoUrl && !brollIsPhoto) {
      if (prevBrollUrlRef.current !== currentSegment.brollVideoUrl) {
        // Check if this URL was preloaded in the hidden preload element
        const wasPreloaded = preloadedUrlRef.current === currentSegment.brollVideoUrl;
        brollVid.src = currentSegment.brollVideoUrl;
        // Only force load() if NOT preloaded — browser cache handles preloaded URLs
        if (!wasPreloaded) brollVid.load();
        prevBrollUrlRef.current = currentSegment.brollVideoUrl;
        preloadedUrlRef.current = null;
      }
      // Reset to start of b-roll clip only when entering a new segment
      if (prevBrollSegmentIdRef.current !== currentSegment.id) {
        brollVid.currentTime = 0;
        prevBrollSegmentIdRef.current = currentSegment.id;
      }

      const tryPlay = () => {
        if (brollVid.paused && isPlayingRef.current) {
          brollVid.play().catch(() => {});
        }
      };

      if (isPlaying && brollVid.paused) {
        // readyState >= 2 is enough to start (HAVE_CURRENT_DATA), no need to wait for >= 3
        if (brollVid.readyState >= 2) {
          tryPlay();
        } else {
          brollVid.addEventListener("canplay", tryPlay, { once: true });
          return () => brollVid.removeEventListener("canplay", tryPlay);
        }
      }
    } else {
      if (!brollVid.paused) brollVid.pause();
      prevBrollSegmentIdRef.current = null;
    }
  }, [currentMode, currentSegment?.brollVideoUrl, currentSegment?.id, isPlaying, brollIsPhoto]);

  // Photo b-roll: set image src
  useEffect(() => {
    const brollImg = brollImageRef.current;
    if (!brollImg) return;

    if (currentMode === "broll" && brollIsPhoto && currentSegment?.brollImageUrl) {
      if (prevBrollImageUrlRef.current !== currentSegment.brollImageUrl) {
        brollImg.src = currentSegment.brollImageUrl;
        prevBrollImageUrlRef.current = currentSegment.brollImageUrl;
      }
    }
  }, [currentMode, brollIsPhoto, currentSegment?.brollImageUrl]);

  // Ken Burns for presenter — alternating zoom direction per segment index
  const presenterIdx = useMemo(() => {
    if (!currentSegment) return 0;
    const presenterSegs = modeSegments.filter((s) => s.mode === "presenter");
    return presenterSegs.findIndex((s) => s.id === currentSegment.id);
  }, [currentSegment, modeSegments]);

  const presenterTransform = useMemo(() => {
    if (currentMode !== "presenter" || !currentSegment) return { scale: 1, translateX: 0, translateY: 0 };
    const segDuration = currentSegment.endTime - currentSegment.startTime;
    if (segDuration <= 0) return { scale: 1, translateX: 0, translateY: 0 };
    const rawProgress = Math.min(
      (currentTime - currentSegment.startTime) / segDuration,
      1
    );
    // Remap progress using zoomStart/zoomEnd window
    const zoomStart = currentSegment.presenterZoomStart ?? 0;
    const zoomEnd = currentSegment.presenterZoomEnd ?? 1;
    const progress = zoomStart >= zoomEnd
      ? 0
      : Math.min(Math.max((rawProgress - zoomStart) / (zoomEnd - zoomStart), 0), 1);
    const zoomType = currentSegment.presenterZoom ?? "zoom-in";
    return computePresenterEffect(
      zoomType,
      progress,
      currentSegment.presenterZoomIntensity ?? 1.5,
      presenterIdx,
      currentSegment.presenterZoomEasing ?? "abrupt"
    );
  }, [currentMode, currentSegment, currentTime, presenterIdx]);

  // B-roll effect transform
  const brollTransformCSS = useMemo(() => {
    if (currentMode !== "broll" || !currentSegment) return "";
    const effect = currentSegment.brollEffect || "static";
    const intensity = currentSegment.brollEffectIntensity ?? 1.0;
    const segDuration = currentSegment.endTime - currentSegment.startTime;
    if (segDuration <= 0) return "";
    const progress = Math.min(
      (currentTime - currentSegment.startTime) / segDuration,
      1
    );
    const transform = computeBRollEffect(effect, progress, intensity);
    return effectToCSS(transform);
  }, [currentMode, currentSegment, currentTime]);

  // ── PLAY/PAUSE/SEEK CONTROLS ──────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      firedMarkersRef.current.clear();
      isPlayingRef.current = true;
      setIsPlaying(true);
      vid.play().catch(() => {
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
    firedMarkersRef.current.clear();
  }, [setCurrentTime, setIsPlaying]);

  const seekTo = useCallback(
    (time: number) => {
      const vid = videoRef.current;
      if (!vid) return;
      vid.currentTime = time;
      setCurrentTime(time);
      firedMarkersRef.current.clear();
    },
    [setCurrentTime]
  );

  // ── SPACEBAR PLAY/PAUSE ────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const container = containerRef.current;
      if (!container || container.offsetParent === null) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) return;
      e.preventDefault();
      e.stopPropagation();
      if (active instanceof HTMLButtonElement) active.blur();
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
      ) return;
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

  // Elapsed time within current segment (for typography animation)
  const segmentElapsed = currentSegment
    ? currentTime - currentSegment.startTime
    : 0;

  // ── B-Roll entry animation progress (0→1 over first 0.15s) ──────────
  const brollEntryProgress = useMemo(() => {
    if (currentMode !== "broll" || !currentSegment) return 1;
    const elapsed = currentTime - currentSegment.startTime;
    return Math.min(elapsed / 0.15, 1);
  }, [currentMode, currentSegment, currentTime]);

  return (
    <div className="flex flex-col h-full">
      {/* Video Container — 9:16 aspect ratio, centered, fills available space */}
      <div className="flex-1 flex items-center justify-center bg-black mx-2 mt-1 md:mx-4 md:mt-2 overflow-hidden" ref={outerContainerRef}>
        <div className="relative" style={{ width: Math.round(REF_WIDTH * containerScale), height: Math.round(REF_HEIGHT * containerScale) }}>
          <div
            ref={containerRef}
            className="absolute top-0 left-0 bg-black rounded-xl overflow-hidden"
            style={{ width: REF_WIDTH, height: REF_HEIGHT, containerType: "inline-size", transform: `scale(${containerScale})`, transformOrigin: "top left" }}
          >
            <div className="absolute inset-0 overflow-hidden">

            {/* ── Layer 1: Background ── */}
            <div className="absolute inset-0 bg-[#0a0a0a]" />

            {/* ── Layer 2: Presenter Video ── */}
            <div
              className={`absolute overflow-hidden transition-opacity duration-200 ease-in-out ${
                currentMode === "presenter"
                  ? "inset-0 opacity-100"
                  : currentMode === "broll" && brollLayout === "split"
                    ? "opacity-100"
                  : currentMode === "broll" && brollLayout === "overlay"
                    ? "inset-0 opacity-100"
                  : currentMode === "broll" && brollLayout === "pip"
                    ? "opacity-100"
                  : currentMode === "broll" && brollLayout === "diagonal"
                    ? "opacity-100"
                    : "inset-0 opacity-0"
              }`}
              style={{
                ...(currentMode === "broll" && brollLayout === "split"
                  ? { top: 0, bottom: 0, left: 0, width: "50%" }
                  : currentMode === "broll" && brollLayout === "pip"
                    ? { bottom: "4%", right: "4%", width: "25%", aspectRatio: "1", borderRadius: "50%", zIndex: 20 }
                    : currentMode === "broll" && brollLayout === "diagonal"
                      ? { inset: 0, clipPath: "polygon(0 0, 60% 0, 40% 100%, 0 100%)" }
                      : {}),
                transform: currentMode === "presenter"
                  ? `scale(${presenterTransform.scale}) translate(${presenterTransform.translateX}%, ${presenterTransform.translateY}%)`
                  : "scale(1)",
                willChange: "transform",
              }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-cover"
                onLoadedMetadata={(e) => {
                  const vid = e.target as HTMLVideoElement;
                  if (Number.isFinite(vid.duration) && vid.duration > 0) {
                    setVideoDuration(vid.duration);
                  }
                }}
                onDurationChange={(e) => {
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
            </div>

          {/* ── Layer 2b: B-Roll Video ── */}
          <div
            className={`absolute transition-opacity duration-150 ease-out overflow-hidden ${
              currentMode === "broll"
                ? "opacity-100"
                : "opacity-0 pointer-events-none"
            } ${
              brollLayout === "overlay"
                ? "rounded-2xl shadow-2xl"
                : ""
            }`}
            style={{
              ...(brollLayout === "fullscreen"
                ? { inset: 0 }
                : brollLayout === "split"
                  ? { top: 0, bottom: 0, right: 0, width: "50%", borderLeft: "2px solid rgba(255,255,255,0.1)" }
                  : brollLayout === "overlay"
                    ? {
                        bottom: "15%",
                        left: "8%",
                        right: "8%",
                        height: "45%",
                        transform: `perspective(800px) rotateY(-2deg) scale(${0.85 + brollEntryProgress * 0.15})`,
                        opacity: brollEntryProgress,
                      }
                    : brollLayout === "pip"
                      ? { inset: 0 }
                      : brollLayout === "cinematic"
                        ? { inset: 0 }
                        : brollLayout === "diagonal"
                          ? { inset: 0, clipPath: "polygon(60% 0, 100% 0, 100% 100%, 40% 100%)" }
                          : { inset: 0 }),
            }}
          >
            <div
              className="w-full h-full"
              style={{
                transform: brollTransformCSS || undefined,
                willChange: brollTransformCSS ? "transform" : undefined,
              }}
            >
              <img
                ref={brollImageRef}
                className="w-full h-full object-cover"
                style={{ display: brollIsPhoto ? "block" : "none" }}
                alt=""
              />
              <video
                ref={brollVideoRef}
                className="w-full h-full object-cover"
                style={{ display: brollIsPhoto ? "none" : "block" }}
                preload="auto"
                loop
                muted
                playsInline
              />
              {/* Hidden preload element for warming browser cache (consecutive b-rolls) */}
              <video
                ref={brollPreloadRef}
                className="hidden"
                preload="auto"
                muted
                playsInline
              />
            </div>
            {/* B-Roll loading fallback — shows query text while media loads */}
            {currentMode === "broll" && currentSegment && !currentSegment.brollVideoUrl && !currentSegment.brollImageUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
                <p className="text-white/40 text-sm font-medium text-center px-8">
                  {currentSegment.brollQuery || "B-Roll"}
                </p>
              </div>
            )}
            {/* Dark overlay on b-roll */}
            <div className={`absolute inset-0 ${
              brollLayout === "overlay" ? "bg-black/10" : "bg-black/25"
            }`} />
            {/* Overlay border glow */}
            {brollLayout === "overlay" && currentMode === "broll" && (
              <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20" />
            )}
          </div>

          {/* Split divider line */}
          {currentMode === "broll" && brollLayout === "split" && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20 z-10" />
          )}

          {/* Cinematic letterbox bars */}
          {currentMode === "broll" && brollLayout === "cinematic" && (
            <>
              <div className="absolute top-0 left-0 right-0 bg-black z-10" style={{ height: "12%" }} />
              <div className="absolute bottom-0 left-0 right-0 bg-black z-10" style={{ height: "12%" }} />
            </>
          )}

          {/* PIP presenter border ring */}
          {currentMode === "broll" && brollLayout === "pip" && (
            <div className="absolute z-20 rounded-full border-2 border-white/30" style={{ bottom: "4%", right: "4%", width: "25%", aspectRatio: "1" }} />
          )}

          {/* Diagonal divider line */}
          {currentMode === "broll" && brollLayout === "diagonal" && (
            <svg className="absolute inset-0 z-10 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="60" y1="0" x2="40" y2="100" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            </svg>
          )}

          {/* ── Layer 2c: Typography Card (Mode C) ── */}
          {currentMode === "typography" && currentSegment?.typographyText && (
            <TypographyCard
              text={currentSegment.typographyText}
              background={currentSegment.typographyBackground || "#F5F0E8"}
              elapsed={segmentElapsed}
              animation={currentSegment.typographyAnimation || "pop-in"}
              stagger={currentSegment.typographyStagger ?? 80}
            />
          )}

          {/* ── Layer 3: Click to play/pause ── */}
          <div
            className="absolute inset-0 z-40 cursor-pointer"
            onClick={togglePlay}
          />

          {/* ── Layer 4: Captions (all modes) ── */}
          <div className="absolute inset-0 z-50 pointer-events-none">
            <CaptionOverlay currentTime={currentTime} />
          </div>
          </div>
          </div>
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
          </div>

          <div className="flex items-center gap-2">
            {/* Mode indicator */}
            {currentSegment && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                currentMode === "presenter"
                  ? "bg-blue-500/20 text-blue-400"
                  : currentMode === "broll"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-purple-500/20 text-purple-400"
              }`}>
                {currentMode === "presenter" ? "A" : currentMode === "broll" ? "B" : "C"}
              </span>
            )}
            <span className="text-sm text-[var(--text-secondary)] font-mono">
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
