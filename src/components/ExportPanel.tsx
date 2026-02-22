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
      try {
        const audioVideo = document.createElement("video");
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
        // Play the audio video in sync — we'll seek it frame by frame alongside the main video
        audioVideo.currentTime = 0;
        audioVideo.play().catch(() => {});
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

      // Render frames
      const fps = 30;
      const totalFrames = Math.ceil(videoDuration * fps);

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
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

        // Draw B-roll overlay - FULLY OPAQUE with ken-burns effect
        const activeBRoll = bRollImages.find(
          (b) => b.url && time >= b.startTime && time <= b.endTime
        );
        if (activeBRoll) {
          const img = bRollImageCache.get(activeBRoll.id);
          if (img) {
            const bDuration = activeBRoll.endTime - activeBRoll.startTime;
            const bProgress = Math.min(Math.max((time - activeBRoll.startTime) / bDuration, 0), 1);

            // Fade in/out at edges, respecting stored opacity
            let bOpacity = activeBRoll.opacity ?? 1;
            if (bProgress < 0.15) bOpacity *= bProgress / 0.15;
            else if (bProgress > 0.85) bOpacity *= (1 - bProgress) / 0.15;

            // Ken Burns: slow zoom + slight pan
            const bScale = 1 + bProgress * 0.12;
            const bPanX = bProgress * -width * 0.02;
            const bPanY = bProgress * -height * 0.01;

            ctx.save();
            ctx.globalAlpha = bOpacity;
            ctx.translate(width / 2 + bPanX, height / 2 + bPanY);
            ctx.scale(bScale, bScale);
            ctx.translate(-width / 2, -height / 2);
            ctx.drawImage(img, 0, 0, width, height);
            ctx.restore();
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

        const caption = activeCaptions.length > 0 ? activeCaptions[0] : null;

        if (caption) {
          const captionDuration = caption.endTime - caption.startTime;
          const captionProgress = Math.min(
            Math.max((time - caption.startTime) / captionDuration, 0),
            1
          );

          ctx.save();
          ctx.font = `${caption.style.fontWeight} ${caption.style.fontSize}px ${caption.style.fontFamily}, sans-serif`;

          // Match CaptionOverlay positions: top-[8%], center (or 18% for hook with keyword), bottom-[12%]
          const isHookWithKeyword = caption.style.position === "center" && caption.keywordLabel;
          const y =
            caption.style.position === "top"
              ? height * 0.08
              : caption.style.position === "center"
              ? (isHookWithKeyword ? height * 0.18 : height / 2)
              : height * 0.88;

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
          if (caption.keywordLabel) {
            const isHookKw = caption.style.position === "center";
            // Hook keywords: much larger (like Captions app); non-hook: moderate
            const kwFontSize = isHookKw
              ? caption.style.fontSize * (isVelocityTheme() ? 0.85 : 0.75)
              : caption.style.fontSize * (isVelocityTheme() ? 0.55 : 0.5);
            const kwFont = `900 ${isVelocityTheme() ? "italic " : ""}${kwFontSize}px ${caption.style.fontFamily}, sans-serif`;
            ctx.font = kwFont;
            ctx.textAlign = "center";

            const kwY = y + kwFontSize * 0.35;

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
              ctx.fillText("\u201C", width / 2, kwY - kwFontSize * 0.9);
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
              const offsetY = kwFontSize * 0.04;
              ctx.strokeText(caption.keywordLabel, width / 2, kwY + offsetY);
            }

            // Front layer: colored fill
            ctx.font = kwFont;
            ctx.textAlign = "center";
            ctx.fillStyle = highlightColor;
            ctx.shadowColor = isVelocityTheme()
              ? "rgba(0,0,0,0.8)"
              : "rgba(0,0,0,0.7)";
            ctx.shadowBlur = isVelocityTheme() ? 10 : 8;
            ctx.fillText(caption.keywordLabel, width / 2, kwY);

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
              ctx.roundRect(
                width / 2 - totalTextWidth / 2 - bgPad,
                y - textHeight * 0.7 - bgPad / 2,
                totalTextWidth + bgPad * 2,
                textHeight + bgPad,
                12
              );
              ctx.fill();
            }

            let currentX = width / 2 - totalTextWidth / 2;
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
        if (brandingConfig.showWatermark && videoDuration >= 6) {
          const wmShowStart = 2;
          const wmShowEnd = videoDuration - 3.5;
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
        if (brandingConfig.showCTA && videoDuration >= 6) {
          const ctaStart = videoDuration - 3;
          if (time >= ctaStart && time <= videoDuration) {
            const ctaProgress = (time - ctaStart) / 3;
            const ctaFadeIn = Math.min(ctaProgress / 0.2, 1);
            const ctaSlideUp = (1 - ctaFadeIn) * height * 0.03;

            ctx.save();
            ctx.globalAlpha = ctaFadeIn * 0.95;

            const ctaText = getCTAText(brandingConfig.ctaTemplate, brandingConfig.ctaCustomText);
            const ctaAccent = getAccentColor();
            const ctaFontSize = Math.max(12, Math.min(width * 0.025, 24));
            const ctaY = height * 0.80 + ctaSlideUp;

            ctx.font = `700 ${ctaFontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillStyle = "#FFFFFF";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 8;
            ctx.fillText(ctaText, width / 2, ctaY);

            // Accent underline
            const textWidth = ctx.measureText(ctaText).width;
            const underlineY = ctaY + ctaFontSize * 0.3;
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.fillStyle = ctaAccent;
            ctx.beginPath();
            ctx.roundRect(
              width / 2 - textWidth / 2,
              underlineY,
              textWidth,
              Math.max(2, height * 0.003),
              2
            );
            ctx.fill();

            ctx.restore();
          }
        }

        setProgress(Math.round((frame / totalFrames) * 100));

        // Small delay to allow UI updates and prevent freezing
        if (frame % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
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
            <div className="mt-2 w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
