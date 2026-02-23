"use client";

import { useState, useCallback, useRef } from "react";
import { Download, Loader2, Film, Settings, Smartphone, Square, Monitor } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { isEmberTheme, isVelocityTheme, isAuthorityTheme, getAuthorityLean } from "@/lib/presets";
import { getCTAText, getAccentColor } from "./CTAOverlay";

type ExportFormat = "mp4" | "webm";
type ExportQuality = "720p" | "1080p";
type AspectRatio = "9:16" | "1:1" | "16:9";

const aspectRatioConfig: Record<AspectRatio, { label: string; icon: React.ReactNode; w: number; h: number; platform: string }> = {
  "9:16": { label: "9:16", icon: <Smartphone className="w-4 h-4" />, w: 1080, h: 1920, platform: "TikTok / Reels / Shorts" },
  "1:1": { label: "1:1", icon: <Square className="w-4 h-4" />, w: 1080, h: 1080, platform: "Instagram Feed / Carrossel" },
  "16:9": { label: "16:9", icon: <Monitor className="w-4 h-4" />, w: 1920, h: 1080, platform: "YouTube / Landscape" },
};

export default function ExportPanel() {
  const { videoUrl, captions, effects, bRollImages, videoDuration, status, setStatus, brandingConfig } =
    useProjectStore();
  const [format, setFormat] = useState<ExportFormat>("webm");
  const [quality, setQuality] = useState<ExportQuality>("1080p");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const exportVideo = useCallback(async () => {
    if (!videoUrl) return;
    setExporting(true);
    setStatus("exporting");
    setProgress(0);

    try {
      const video = document.createElement("video");
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      video.muted = true;

      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve();
        video.load();
      });

      // WebM fix: if duration is Infinity (common with teleprompter recordings),
      // seek to a large time to force the browser to calculate the real duration.
      if (!isFinite(video.duration) || video.duration <= 0) {
        video.currentTime = Number.MAX_SAFE_INTEGER;
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 2000);
          video.onseeked = () => { clearTimeout(t); resolve(); };
        });
        video.currentTime = 0;
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 500);
          video.onseeked = () => { clearTimeout(t); resolve(); };
        });
      }

      // Safeguard: use actual video element duration (not just store value)
      // This ensures correct timing regardless of upload method (file upload or teleprompter)
      const actualDuration = video.duration;
      const exportDuration = (actualDuration && isFinite(actualDuration) && actualDuration > 0)
        ? actualDuration
        : videoDuration;

      const config = aspectRatioConfig[aspectRatio];
      const qualityMultiplier = quality === "720p" ? 720 / 1080 : 1;
      const width = Math.round(config.w * qualityMultiplier);
      const height = Math.round(config.h * qualityMultiplier);

      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      // Prefer MP4 for universal compatibility (iOS, Android, desktop)
      const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2")
        ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : format === "webm" ? "video/webm;codecs=vp9" : "video/webm";
      const stream = canvas.captureStream(30);

      // Add audio from original video using a hidden video element
      let audioVideoEl: HTMLVideoElement | null = null;
      try {
        const audioVideo = document.createElement("video");
        audioVideoEl = audioVideo;
        audioVideo.src = videoUrl;
        audioVideo.muted = false;
        audioVideo.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          audioVideo.onloadeddata = () => resolve();
          audioVideo.load();
        });
        const audioCtx = new AudioContext();
        const audioSource = audioCtx.createMediaElementSource(audioVideo);
        const dest = audioCtx.createMediaStreamDestination();
        audioSource.connect(dest);
        audioSource.connect(audioCtx.destination); // Also connect to speakers for monitoring
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
        // Audio playback deferred until right before the render loop for precise sync
        audioVideo.currentTime = 0;
      } catch {
        // Audio extraction might fail - continue without audio
      }

      const actualMime = MediaRecorder.isTypeSupported(mimeType)
        ? mimeType
        : "video/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType: actualMime,
        videoBitsPerSecond: quality === "1080p" ? 8000000 : 4000000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const exportDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: actualMime });
          resolve(blob);
        };
      });

      recorder.start(100);

      // Pre-load B-roll images to avoid loading per frame
      const bRollImageCache = new Map<string, HTMLImageElement>();
      for (const b of bRollImages) {
        if (b.url) {
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = b.url;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              if (img.complete) resolve();
            });
            bRollImageCache.set(b.id, img);
          } catch {
            // Skip failed images
          }
        }
      }

      // Start audio playback right before render loop for precise sync.
      // Audio plays at 1x speed while we render frames at real-time pace.
      if (audioVideoEl) {
        audioVideoEl.currentTime = 0;
        audioVideoEl.play().catch(() => {});
      }

      // Render frames — paced at real-time intervals for correct MediaRecorder timestamps.
      // MediaRecorder uses wall-clock time for timestamps, so we MUST space frames
      // at 1/fps intervals to produce a correctly-timed recording.
      const fps = 30;
      const totalFrames = Math.ceil(exportDuration * fps);
      const exportWallStart = performance.now();

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          const seekTimeout = setTimeout(resolve, 300); // Safety: don't hang on failed seek
          video.onseeked = () => { clearTimeout(seekTimeout); resolve(); };
        });

        // Clear
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);

        // Apply video effects
        ctx.save();

        // Calculate active effects
        const activeEffects = effects.filter(
          (e) => time >= e.startTime && time <= e.endTime
        );

        let scale = 1;
        let tx = 0;
        let ty = 0;

        // Build CSS filter string for color-grade effects
        let cssFilter = "";
        for (const effect of activeEffects) {
          const p =
            (time - effect.startTime) / (effect.endTime - effect.startTime);
          const params = effect.params as Record<string, number | string>;

          switch (effect.type) {
            case "zoom-in": {
              const targetScale = (params.scale as number) || 1.3;
              const eased = 1 - Math.pow(1 - p, 3);
              scale *= 1 + (targetScale - 1) * eased;
              const fx = ((params.focusX as number) || 0.5) - 0.5;
              const fy = ((params.focusY as number) || 0.4) - 0.5;
              tx -= fx * (scale - 1) * width;
              ty -= fy * (scale - 1) * height;
              break;
            }
            case "zoom-out": {
              const targetScale = (params.scale as number) || 1.3;
              const eased = 1 - Math.pow(1 - p, 3);
              scale *= targetScale - (targetScale - 1) * eased;
              break;
            }
            case "zoom-pulse": {
              const targetScale = (params.scale as number) || 1.2;
              scale *= 1 + (targetScale - 1) * Math.sin(p * Math.PI);
              break;
            }
            case "pan-left":
              tx -= ((params.distance as number) || 30) * p;
              break;
            case "pan-right":
              tx += ((params.distance as number) || 30) * p;
              break;
            case "shake": {
              const intensity = (params.intensity as number) || 3;
              const freq = (params.frequency as number) || 15;
              tx += Math.sin(p * freq * Math.PI * 2) * intensity;
              ty += Math.cos(p * freq * Math.PI * 2 + 1) * intensity;
              break;
            }
            case "color-grade": {
              const preset = params.preset as string;
              if (preset === "cinematic-warm")
                cssFilter += " sepia(0.12) saturate(1.15) contrast(1.08)";
              else if (preset === "ember-warm")
                cssFilter += " sepia(0.2) saturate(1.1) contrast(1.06) brightness(1.02)";
              else if (preset === "velocity-gold")
                cssFilter += " sepia(0.15) saturate(1.25) contrast(1.12) brightness(1.04)";
              else if (preset === "authority-deep")
                cssFilter += " saturate(1.05) contrast(1.1) brightness(0.98) hue-rotate(10deg)";
              else if (preset === "cold-thriller")
                cssFilter += " saturate(0.8) hue-rotate(200deg) contrast(1.15)";
              else if (preset === "vintage")
                cssFilter += " sepia(0.3) saturate(0.9) contrast(1.05)";
              else if (preset === "high-contrast")
                cssFilter += " contrast(1.4) saturate(1.1)";
              break;
            }
            case "flash": {
              const flashProgress = 1 - p;
              if (flashProgress > 0.5) cssFilter += ` brightness(${1 + flashProgress * 2})`;
              break;
            }
          }
        }

        // Apply color-grade CSS filter to canvas context (supported in modern browsers)
        if (cssFilter.trim()) {
          ctx.filter = cssFilter.trim();
        }

        ctx.translate(width / 2 + tx, height / 2 + ty);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);

        // Draw video frame - center crop to target aspect ratio
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = width / height;
        let dw, dh, dx, dy;

        if (videoAspect > canvasAspect) {
          dh = height;
          dw = height * videoAspect;
          dx = (width - dw) / 2;
          dy = 0;
        } else {
          dw = width;
          dh = width / videoAspect;
          dx = 0;
          dy = (height - dh) / 2;
        }

        ctx.drawImage(video, dx, dy, dw, dh);
        ctx.restore();

        // Draw B-roll overlay with position modes, animations, and cinematic overlay
        const activeBRoll = bRollImages.find(
          (b) => b.url && time >= b.startTime && time <= b.endTime
        );
        if (activeBRoll) {
          const img = bRollImageCache.get(activeBRoll.id);
          if (img) {
            const bDuration = activeBRoll.endTime - activeBRoll.startTime;
            const bProgress = Math.min(Math.max((time - activeBRoll.startTime) / bDuration, 0), 1);

            // Fade in/out envelope
            let bOpacity = activeBRoll.opacity ?? 1;
            if (bProgress < 0.15) bOpacity *= bProgress / 0.15;
            else if (bProgress > 0.85) bOpacity *= (1 - bProgress) / 0.15;

            // Position mode bounds
            let bx = 0, by = 0, bw = width, bh = height;
            const pos = activeBRoll.position || "fullscreen";
            switch (pos) {
              case "pip":
                bw = Math.round(width * 0.35);
                bh = Math.round(height * 0.3);
                bx = width - bw - Math.round(width * 0.04);
                by = Math.round(height * 0.55);
                break;
              case "overlay":
                bx = Math.round(width * 0.08);
                by = Math.round(height * 0.08);
                bw = width - bx * 2;
                bh = height - by * 2;
                break;
              case "split":
                bx = Math.round(width * 0.5);
                bw = Math.round(width * 0.5);
                break;
            }

            // Animation transforms
            let bScale = 1;
            let bPanX = 0;
            let bPanY = 0;
            let bBlur = 0;
            const anim = activeBRoll.animation || "ken-burns";

            switch (anim) {
              case "fade": break;
              case "slide":
                bPanX = (bProgress - 0.5) * -bw * 0.06;
                break;
              case "zoom":
                bScale = 1 + bProgress * 0.2;
                break;
              case "pan-left":
                bPanX = ((1 - bProgress) * 4 - 2) * bw * 0.01;
                break;
              case "pan-up":
                bPanY = ((1 - bProgress) * 4 - 2) * bh * 0.01;
                break;
              case "pan-down":
                bPanY = (bProgress * 4 - 2) * bh * 0.01;
                break;
              case "blur-in":
                bScale = 1 + (1 - bProgress) * 0.05;
                bBlur = (1 - bProgress) * 8;
                break;
              case "cinematic-reveal":
                bScale = 1.4 - bProgress * 0.4;
                bPanY = (1 - bProgress) * -bh * 0.03;
                bBlur = Math.max(0, (1 - bProgress * 3)) * 4;
                break;
              case "glitch-in": {
                const gp = Math.min(bProgress / 0.2, 1);
                if (gp < 1) {
                  const ga = (1 - gp) * 3;
                  bPanX = Math.sin(gp * Math.PI * 8) * ga * bw * 0.01;
                  bPanY = Math.cos(gp * Math.PI * 6) * ga * 0.5 * bh * 0.01;
                }
                bScale = 1 + bProgress * 0.06;
                if (bProgress < 0.15) bBlur = (1 - bProgress / 0.15) * 3;
                break;
              }
              case "parallax":
                bScale = 1.08;
                bPanX = (bProgress - 0.5) * -bw * 0.04;
                bPanY = Math.sin(bProgress * Math.PI) * -bh * 0.02;
                break;
              case "ken-burns":
              default:
                bScale = 1 + bProgress * 0.12;
                bPanX = bProgress * -bw * 0.02;
                bPanY = bProgress * -bh * 0.01;
                break;
            }

            ctx.save();
            ctx.globalAlpha = bOpacity;

            // Clip to position bounds for non-fullscreen
            if (pos !== "fullscreen") {
              ctx.beginPath();
              if (pos === "pip" || pos === "overlay") {
                const r = pos === "pip" ? 12 : 16;
                ctx.roundRect(bx, by, bw, bh, r);
              } else {
                ctx.rect(bx, by, bw, bh);
              }
              ctx.clip();
            }

            // Apply blur if needed
            if (bBlur > 0) ctx.filter = `blur(${bBlur}px)`;

            // Draw B-roll image with animation transform
            const cx = bx + bw / 2 + bPanX;
            const cy = by + bh / 2 + bPanY;
            ctx.translate(cx, cy);
            ctx.scale(bScale, bScale);
            ctx.translate(-bw / 2, -bh / 2);
            ctx.drawImage(img, 0, 0, bw, bh);
            ctx.filter = "none";

            // Cinematic gradient overlay
            if (activeBRoll.cinematicOverlay !== false) {
              ctx.translate(bw / 2, bh / 2);
              ctx.scale(1 / bScale, 1 / bScale);
              ctx.translate(-cx, -cy);
              const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
              grad.addColorStop(0, "rgba(0,0,0,0.25)");
              grad.addColorStop(0.3, "rgba(0,0,0,0)");
              grad.addColorStop(0.7, "rgba(0,0,0,0)");
              grad.addColorStop(1, "rgba(0,0,0,0.35)");
              ctx.fillStyle = grad;
              ctx.fillRect(bx, by, bw, bh);
            }

            ctx.restore();

            // Border for non-fullscreen positions
            if (pos !== "fullscreen") {
              ctx.save();
              ctx.globalAlpha = bOpacity * 0.15;
              ctx.strokeStyle = "#FFFFFF";
              ctx.lineWidth = 1;
              ctx.beginPath();
              const r = pos === "pip" ? 12 : pos === "overlay" ? 16 : 0;
              ctx.roundRect(bx, by, bw, bh, r);
              ctx.stroke();
              ctx.restore();
            }
          }
        }

        // Draw transition overlays
        for (const effect of activeEffects) {
          const p =
            (time - effect.startTime) / (effect.endTime - effect.startTime);
          if (effect.type === "transition-fade") {
            ctx.fillStyle = `rgba(0,0,0,${Math.sin(p * Math.PI) * 0.8})`;
            ctx.fillRect(0, 0, width, height);
          } else if (effect.type === "flash") {
            const flashP = 1 - p;
            if (flashP > 0.5) {
              ctx.fillStyle = `rgba(255,255,255,${flashP})`;
              ctx.fillRect(0, 0, width, height);
            }
          }
        }

        // Draw vignette — match VideoPreview CSS: ellipse at center, transparent 50%, rgba 100%
        const vignetteEffect = activeEffects.find((e) => e.type === "vignette");
        if (vignetteEffect) {
          const intensity = (vignetteEffect.params.intensity as number) || 0.3;
          // Use diagonal as reference radius to simulate CSS ellipse gradient
          const diagonal = Math.sqrt(width * width + height * height) / 2;
          const gradient = ctx.createRadialGradient(
            width / 2, height / 2, diagonal * 0.5,  // 50% transparent
            width / 2, height / 2, diagonal           // 100% full intensity
          );
          gradient.addColorStop(0, "transparent");
          gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
        }

        // Draw letterbox
        if (activeEffects.some((e) => e.type === "letterbox")) {
          const barH = height * 0.1;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, barH);
          ctx.fillRect(0, height - barH, width, barH);
        }

        // Draw captions - only ONE at a time (pick first active, sorted by startTime)
        const activeCaptions = captions
          .filter((c) => time >= c.startTime && time < c.endTime)
          .sort((a, b) => a.startTime - b.startTime);

        let caption = activeCaptions.length > 0 ? activeCaptions[0] : null;

        // CTA is now at top-right — no need to hide bottom captions

        if (caption) {
          const captionDuration = caption.endTime - caption.startTime;
          const captionProgress = Math.min(
            Math.max((time - caption.startTime) / captionDuration, 0),
            1
          );

          ctx.save();
          ctx.font = `${caption.style.fontWeight} ${caption.style.fontSize}px ${caption.style.fontFamily}, sans-serif`;
          // Apply letter-spacing if set (authority theme uses tracking for professional look)
          if (caption.style.letterSpacing && "letterSpacing" in ctx) {
            (ctx as unknown as Record<string, string>).letterSpacing = caption.style.letterSpacing;
          }

          // Match CaptionOverlay positions: top-[8%], center (or 18% for hook with keyword), bottom-[12%]
          const isHookWithKeyword = caption.style.position === "center" && caption.keywordLabel;
          // When keyword is displayed separately (hideKeyword), subtitle goes to top-[4%]
          const hideKeyword = !!caption.keywordLabel;
          let y =
            caption.style.position === "top"
              ? height * 0.08
              : caption.style.position === "center"
              ? (hideKeyword ? height * 0.04 : isHookWithKeyword ? height * 0.18 : height / 2)
              : height * 0.88;

          // Apply user offset adjustments
          if (caption.style.offsetX) {
            // offsetX shifts horizontally — applied as translate in canvas
            // We'll apply this when drawing text below
          }
          if (caption.style.offsetY) {
            y += (caption.style.offsetY / 100) * height;
          }

          // Theme-aware highlight colors matching CaptionOverlay THEME_COLORS
          const highlightColor = isAuthorityTheme()
            ? (getAuthorityLean() === "amber" ? "#E8A838" : "#00D4AA")
            : isVelocityTheme()
              ? "#FFD700"
              : isEmberTheme()
                ? "#D4835C"
                : "#CCFF00";
          const highlightGlow = isAuthorityTheme()
            ? (getAuthorityLean() === "amber" ? "rgba(232,168,56,0.4)" : "rgba(0,212,170,0.4)")
            : isVelocityTheme()
              ? "rgba(255,215,0,0.5)"
              : isEmberTheme()
                ? "rgba(212,131,92,0.4)"
                : "rgba(204,255,0,0.4)";

          // Draw keyword label (Ember/Velocity dual-layer) ABOVE subtitle
          // Keyword renders at the position the user chose (with offsets applied to y already)
          // But keyword has its own vertical position (top-[18%] for hook)
          if (caption.keywordLabel) {
            const isHookKw = caption.style.position === "center";
            const kwFontSize = isHookKw
              ? caption.style.fontSize * (isVelocityTheme() ? 0.85 : 0.75)
              : caption.style.fontSize * (isVelocityTheme() ? 0.55 : 0.5);
            const kwFont = `900 ${isVelocityTheme() ? "italic " : ""}${kwFontSize}px ${caption.style.fontFamily}, sans-serif`;
            ctx.font = kwFont;
            ctx.textAlign = "center";

            // Keyword position: top-[18%] for hook, top-[8%] for others
            const kwBaseY = isHookKw ? height * 0.18 : height * 0.08;
            const kwOffsetY = caption.style.offsetY ? (caption.style.offsetY / 100) * height : 0;
            const kwOffsetX = caption.style.offsetX ? (caption.style.offsetX / 100) * width : 0;
            const kwCenterX = width / 2 + kwOffsetX;
            const kwY = kwBaseY + kwOffsetY + kwFontSize * 0.35;

            // Decorative quote above keyword (centered)
            if (caption.keywordQuotes) {
              const quoteFontSize = caption.style.fontSize * (isVelocityTheme() ? 0.5 : 0.45);
              const quoteFont = `900 ${isVelocityTheme() ? "italic " : ""}${quoteFontSize}px ${
                isVelocityTheme() ? "Inter, system-ui, sans-serif" : "Georgia, 'Times New Roman', serif"
              }`;
              const quoteColor = isVelocityTheme() ? "#DAA520" : isEmberTheme() ? "#C8956A" : "#CCFF00";
              ctx.font = quoteFont;
              ctx.fillStyle = quoteColor;
              ctx.globalAlpha = isVelocityTheme() ? 0.85 : 0.7;
              ctx.shadowColor = "rgba(0,0,0,0.6)";
              ctx.shadowBlur = 6;
              ctx.textAlign = "center";
              ctx.fillText("\u201C", kwCenterX, kwY - kwFontSize * 0.9);
              ctx.globalAlpha = 1;
            }

            // For hook keywords, draw dual-layer (white outline behind + colored fill)
            if (isHookKw) {
              ctx.font = kwFont;
              ctx.textAlign = "center";
              // Back layer: white outline
              ctx.strokeStyle = "rgba(255,255,255,0.6)";
              ctx.lineWidth = 3;
              ctx.lineJoin = "round";
              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              const kwStrokeOffsetY = kwFontSize * 0.04;
              ctx.strokeText(caption.keywordLabel, kwCenterX, kwY + kwStrokeOffsetY);
            }

            // Front layer: colored fill
            ctx.font = kwFont;
            ctx.textAlign = "center";
            ctx.fillStyle = highlightColor;
            ctx.shadowColor = isVelocityTheme()
              ? "rgba(0,0,0,0.8)"
              : "rgba(0,0,0,0.7)";
            ctx.shadowBlur = isVelocityTheme() ? 10 : 8;
            ctx.fillText(caption.keywordLabel, kwCenterX, kwY);

            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          }

          // Skip subtitle words if keyword matches caption text (avoid duplication)
          const keywordMatchesCaption = caption.keywordLabel
            && caption.text.toUpperCase().trim() === caption.keywordLabel.toUpperCase().trim();

          ctx.font = `${caption.style.fontWeight} ${caption.style.fontSize}px ${caption.style.fontFamily}, sans-serif`;

          const words = caption.text.split(" ");
          const totalWords = words.length;
          // Karaoke: determine which word is currently being spoken.
          // Prefer real per-word timestamps; fall back to proportional estimate.
          let currentWordIndex = totalWords - 1;
          if (totalWords > 1) {
            const timings = caption.wordTimings;
            if (timings && timings.length === totalWords) {
              currentWordIndex = 0;
              for (let i = totalWords - 1; i >= 0; i--) {
                if (time >= timings[i].start) { currentWordIndex = i; break; }
              }
            } else {
              const charLengths = words.map((w) => Math.max(w.length, 1));
              const totalChars = charLengths.reduce((a, b) => a + b, 0);
              let cumulative = 0;
              for (let i = 0; i < totalWords; i++) {
                cumulative += charLengths[i] / totalChars;
                if (captionProgress < cumulative) { currentWordIndex = i; break; }
              }
            }
          }

          // Calculate total text width for centering
          const spaceWidth = ctx.measureText(" ").width;
          const wordWidths = words.map((w) => ctx.measureText(w).width);
          const totalTextWidth =
            wordWidths.reduce((a, b) => a + b, 0) +
            spaceWidth * (words.length - 1);

          // Draw subtitle words with background and word-by-word highlighting
          // Skip entirely if keyword matches caption text (avoid duplication, like CaptionOverlay)
          if (!keywordMatchesCaption) {
            // Draw background
            if (caption.style.backgroundOpacity > 0) {
              const bgPad = 16;
              const textHeight = caption.style.fontSize;
              ctx.fillStyle =
                caption.style.backgroundColor +
                Math.round(caption.style.backgroundOpacity * 255)
                  .toString(16)
                  .padStart(2, "0");
              ctx.beginPath();
              const bgXOffset = caption.style.offsetX ? (caption.style.offsetX / 100) * width : 0;
              ctx.roundRect(
                width / 2 - totalTextWidth / 2 - bgPad + bgXOffset,
                y - textHeight * 0.7 - bgPad / 2,
                totalTextWidth + bgPad * 2,
                textHeight + bgPad,
                12
              );
              ctx.fill();
            }

            const xOffset = caption.style.offsetX ? (caption.style.offsetX / 100) * width : 0;
            let currentX = width / 2 - totalTextWidth / 2 + xOffset;
            ctx.textAlign = "left";
            ctx.lineJoin = "round";
            ctx.miterLimit = 2;

            for (let wi = 0; wi < words.length; wi++) {
              const word = words[wi];
              const isActive = wi === currentWordIndex;
              const isPast = wi < currentWordIndex;
              const isEmphasis = caption.emphasis.some((e) =>
                word.toLowerCase().replace(/[.,!?;:]/g, "").includes(e.toLowerCase())
              );

              // Determine color — theme-aware
              let wordColor = caption.style.color;
              if (isActive) {
                wordColor = highlightColor;
              } else if (isEmphasis) {
                wordColor = highlightColor;
              } else if (!isPast) {
                // Future words: slightly dimmed
                wordColor = caption.style.color + "99";
              }

              // Shadow for active word — theme-aware glow
              if (isActive) {
                ctx.shadowColor = highlightGlow;
                ctx.shadowBlur = 20;
                ctx.shadowOffsetY = 0;
              } else if (caption.style.shadowBlur > 0) {
                ctx.shadowColor = caption.style.shadowColor;
                ctx.shadowBlur = caption.style.shadowBlur;
                ctx.shadowOffsetY = 2;
              } else {
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
              }

              // Set font weight
              const fontWeight = isActive || isEmphasis ? 900 : caption.style.fontWeight;
              ctx.font = `${fontWeight} ${caption.style.fontSize}px ${caption.style.fontFamily}, sans-serif`;

              // Stroke
              if (caption.style.strokeWidth > 0) {
                ctx.strokeStyle = caption.style.strokeColor;
                ctx.lineWidth = caption.style.strokeWidth * 2;
                ctx.strokeText(word, currentX, y);
              }

              // Fill
              ctx.fillStyle = wordColor;
              ctx.fillText(word, currentX, y);

              currentX += wordWidths[wi] + spaceWidth;
            }
          }

          ctx.restore();
        }

        // Draw watermark (name + title, top-left, from 2s to duration-3.5s)
        if (brandingConfig.showWatermark && exportDuration >= 6) {
          const wmShowStart = 2;
          const wmShowEnd = exportDuration - 3.5;
          if (time >= wmShowStart && time <= wmShowEnd) {
            const wmFadeIn = Math.min((time - wmShowStart) / 0.5, 1);
            const wmFadeOut = Math.min((wmShowEnd - time) / 0.5, 1);
            const wmOpacity = Math.min(wmFadeIn, wmFadeOut) * 0.7;

            ctx.save();
            ctx.globalAlpha = wmOpacity;

            const wmAccent = getAccentColor();
            const wmX = width * 0.04;
            const wmY = height * 0.06;

            // Accent bar
            const barWidth = Math.max(2, width * 0.003);
            const barHeight = height * 0.035;
            ctx.fillStyle = wmAccent;
            ctx.beginPath();
            ctx.roundRect(wmX, wmY, barWidth, barHeight, barWidth / 2);
            ctx.fill();

            // Name
            const nameFontSize = Math.max(8, Math.min(width * 0.012, 13));
            ctx.font = `700 ${nameFontSize}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "left";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 4;
            ctx.fillText(brandingConfig.name.toUpperCase(), wmX + barWidth + width * 0.01, wmY + nameFontSize * 0.85);

            // Title
            const titleFontSize = Math.max(6, Math.min(width * 0.009, 10));
            ctx.font = `500 ${titleFontSize}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 3;
            ctx.fillText(brandingConfig.title, wmX + barWidth + width * 0.01, wmY + nameFontSize + titleFontSize * 0.9);

            ctx.restore();
          }
        }

        // Draw CTA overlay (last 3 seconds)
        if (brandingConfig.showCTA && exportDuration >= 6) {
          const ctaStart = exportDuration - 3;
          if (time >= ctaStart && time <= exportDuration) {
            const ctaProgress = (time - ctaStart) / 3;
            const ctaFadeIn = Math.min(ctaProgress / 0.2, 1);
            const ctaSlideX = (1 - ctaFadeIn) * width * 0.03;

            ctx.save();
            ctx.globalAlpha = ctaFadeIn * 0.95;

            const ctaText = getCTAText(brandingConfig.ctaTemplate, brandingConfig.ctaCustomText);
            const ctaAccent = getAccentColor();
            const ctaFontSize = Math.max(10, Math.min(width * 0.018, 18));
            const ctaPadX = width * 0.015;
            const ctaPadY = height * 0.008;
            const ctaX = width * 0.96 + ctaSlideX; // right-aligned
            const ctaY = height * 0.06;

            // Background pill
            ctx.font = `700 ${ctaFontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "right";
            const textWidth = ctx.measureText(ctaText).width;
            const pillX = ctaX - textWidth - ctaPadX * 2;
            const pillY = ctaY - ctaPadY;
            const pillW = textWidth + ctaPadX * 2;
            const pillH = ctaFontSize + ctaPadY * 2;

            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, 6);
            ctx.fill();

            // Text
            ctx.fillStyle = "#FFFFFF";
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 4;
            ctx.fillText(ctaText, ctaX - ctaPadX, ctaY + ctaFontSize * 0.75);

            // Accent underline (right-aligned, shorter)
            const underlineW = Math.min(60, textWidth * 0.5);
            const underlineY = ctaY + ctaFontSize + ctaPadY * 0.5;
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.fillStyle = ctaAccent;
            ctx.beginPath();
            ctx.roundRect(
              ctaX - ctaPadX - underlineW,
              underlineY,
              underlineW,
              Math.max(2, height * 0.002),
              2
            );
            ctx.fill();

            ctx.restore();
          }
        }

        setProgress(Math.round((frame / totalFrames) * 100));

        // Frame pacing: wait until the correct wall-clock position for this frame.
        // This ensures the MediaRecorder records at the correct speed (not sped up).
        // Export time ≈ video duration (real-time rendering).
        const targetWallTime = exportWallStart + (frame + 1) * (1000 / fps);
        const nowMs = performance.now();
        const sleepMs = targetWallTime - nowMs;
        if (sleepMs > 1) {
          await new Promise(r => setTimeout(r, sleepMs));
        }
      }

      // Stop audio playback and clean up
      if (audioVideoEl) {
        audioVideoEl.pause();
        audioVideoEl.src = "";
      }

      recorder.stop();
      const blob = await exportDone;

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      a.download = `cineai-export-${aspectRatio.replace(":", "x")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("ready");
    } catch (error) {
      console.error("Export error:", error);
      alert(
        "Erro na exportação: " +
          (error instanceof Error ? error.message : "Erro desconhecido")
      );
      setStatus("ready");
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [videoUrl, captions, effects, bRollImages, videoDuration, format, quality, aspectRatio, setStatus, brandingConfig]);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Download className="w-4 h-4 text-[var(--accent-light)]" />
        Exportar Vídeo
      </h3>

      <div className="space-y-3">
        {/* Aspect Ratio */}
        <div>
          <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Proporção / Plataforma
          </label>
          <div className="flex gap-2 mt-1">
            {(Object.keys(aspectRatioConfig) as AspectRatio[]).map((ar) => {
              const cfg = aspectRatioConfig[ar];
              return (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={`flex-1 py-2 flex flex-col items-center gap-1 text-xs rounded-lg transition-colors ${
                    aspectRatio === ar
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {cfg.icon}
                  <span className="font-medium">{cfg.label}</span>
                  <span className={`text-[9px] ${aspectRatio === ar ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
                    {cfg.platform.split(" / ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] mt-1">
            {aspectRatioConfig[aspectRatio].platform}
          </p>
        </div>

        {/* Format */}
        <div>
          <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Formato
          </label>
          <div className="flex gap-2 mt-1">
            {(["webm", "mp4"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  format === f
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {f.toUpperCase()}
                {f === "mp4" && (
                  <span className="block text-[9px] opacity-70">
                    (exporta como WebM)
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div>
          <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Qualidade
          </label>
          <div className="flex gap-2 mt-1">
            {(["720p", "1080p"] as ExportQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  quality === q
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {q}
                <span className={`block text-[9px] ${quality === q ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
                  {q === "1080p"
                    ? `${aspectRatioConfig[aspectRatio].w}x${aspectRatioConfig[aspectRatio].h}`
                    : `${Math.round(aspectRatioConfig[aspectRatio].w * 720/1080)}x${Math.round(aspectRatioConfig[aspectRatio].h * 720/1080)}`
                  }
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-2">
            <Settings className="w-3 h-3" />
            <span>
              {captions.length} legendas, {effects.length} efeitos,{" "}
              {bRollImages.filter((b) => b.url).length} B-rolls
            </span>
          </div>

          <button
            onClick={exportVideo}
            disabled={exporting || status === "exporting"}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exportando... {progress}%
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                Exportar Vídeo
              </>
            )}
          </button>

          {exporting && (
            <>
              <div className="mt-2 w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {videoDuration > 0 && (
                <p className="text-[10px] text-[var(--text-secondary)] mt-1 text-center">
                  Tempo estimado: ~{Math.ceil(videoDuration)}s (renderização em tempo real)
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
