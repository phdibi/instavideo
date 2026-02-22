"use client";

import { useRef, useEffect, useCallback } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import type { SegmentationService as SegServiceType, SegmentationMask } from "@/lib/segmentation";

/**
 * useBackgroundReplacement — React hook for real-time person segmentation + background replacement.
 *
 * Manages:
 *  - Lazy-loading the MediaPipe segmentation model
 *  - RAF loop for real-time compositing at ~30fps
 *  - Background image loading
 *  - Microphone overlay rendering
 *
 * @param videoRef  - Ref to the <video> element providing frames
 * @param canvasRef - Ref to the <canvas> element where composited output is drawn
 * @returns { isActive, isLoading } - Whether background replacement is active and if model is loading
 */
export function useBackgroundReplacement(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const backgroundConfig = useProjectStore((s) => s.backgroundConfig);
  const isPlaying = useProjectStore((s) => s.isPlaying);

  // Only fully activate when BOTH enabled AND a background image is set.
  // Without a background image, segmentation would use a dark fallback that
  // creates visible artifacts (shadow on face).
  const isConfigReady = backgroundConfig.enabled && !!backgroundConfig.backgroundImageUrl;

  const rafIdRef = useRef<number>(0);
  const segServiceRef = useRef<typeof SegServiceType | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const lastFrameTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const isLoadingRef = useRef(false);
  const isActiveRef = useRef(false);

  // Load background image when URL changes
  useEffect(() => {
    if (!backgroundConfig.backgroundImageUrl) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgImageRef.current = img;
    };
    img.src = backgroundConfig.backgroundImageUrl;
  }, [backgroundConfig.backgroundImageUrl]);

  // Main render function
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const SegService = segServiceRef.current;

    if (!video || !canvas || !SegService || !isConfigReady) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    // Skip if video has no dimensions yet
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    // Skip if video is paused and time hasn't changed (no seek)
    if (video.paused && video.currentTime === lastVideoTimeRef.current) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    // Throttle to ~24fps (every 42ms) for smooth balance of quality vs performance
    const now = performance.now();
    if (now - lastFrameTimeRef.current < 42) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    lastFrameTimeRef.current = now;

    // Match canvas to video display dimensions
    const targetW = canvas.clientWidth * (window.devicePixelRatio > 1 ? 1.5 : 1);
    const targetH = canvas.clientHeight * (window.devicePixelRatio > 1 ? 1.5 : 1);
    if (Math.abs(canvas.width - targetW) > 10 || Math.abs(canvas.height - targetH) > 10) {
      canvas.width = Math.round(targetW);
      canvas.height = Math.round(targetH);
    }

    const w = canvas.width;
    const h = canvas.height;

    try {
      // Get segmentation mask
      const mask: SegmentationMask | null = SegService.segmentImage(video);

      if (mask) {
        // Composite: background → person → microphone
        SegService.compositeFrame(
          ctx,
          video,
          mask,
          bgImageRef.current,
          w,
          h,
          backgroundConfig.edgeSmoothing
        );

        // Draw microphone if enabled
        if (backgroundConfig.microphoneOverlay) {
          SegService.drawMicrophone(ctx, w, h);
        }
      } else {
        // Fallback: draw raw video frame if segmentation fails
        ctx.drawImage(video, 0, 0, w, h);
      }
    } catch {
      // On error, just draw the video frame
      ctx.drawImage(video, 0, 0, w, h);
    }

    rafIdRef.current = requestAnimationFrame(renderFrame);
  }, [backgroundConfig, isConfigReady, videoRef, canvasRef]);

  // Initialize/teardown segmentation service
  useEffect(() => {
    if (!isConfigReady) {
      isActiveRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      return;
    }

    // Lazy-load the segmentation module
    isLoadingRef.current = true;
    import("@/lib/segmentation").then(({ SegmentationService }) => {
      SegmentationService.getInstance().then(() => {
        // Ensure IMAGE mode for preview
        SegmentationService.setImageMode().then(() => {
          segServiceRef.current = SegmentationService;
          isLoadingRef.current = false;
          isActiveRef.current = true;

          // Start the render loop
          rafIdRef.current = requestAnimationFrame(renderFrame);
        });
      });
    }).catch((err) => {
      console.error("[CineAI] Failed to load segmentation model:", err);
      isLoadingRef.current = false;
    });

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [isConfigReady, renderFrame]);

  // Re-render single frame when video seeks (paused state)
  useEffect(() => {
    if (!isConfigReady || isPlaying) return;

    // When paused, render a single frame on time change
    const video = videoRef.current;
    if (!video) return;

    const handleSeeked = () => {
      if (segServiceRef.current) {
        // Trigger one frame render
        const canvas = canvasRef.current;
        if (canvas) {
          lastFrameTimeRef.current = 0; // Force render
        }
      }
    };

    video.addEventListener("seeked", handleSeeked);
    return () => video.removeEventListener("seeked", handleSeeked);
  }, [isConfigReady, isPlaying, videoRef, canvasRef]);

  return {
    isActive: isConfigReady && isActiveRef.current,
    isLoading: isLoadingRef.current,
  };
}
