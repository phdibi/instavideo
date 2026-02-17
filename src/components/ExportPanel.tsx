"use client";

import { useState, useCallback, useRef } from "react";
import { Download, Loader2, Film, Settings, Smartphone, Square, Monitor } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";

type ExportFormat = "mp4" | "webm";
type ExportQuality = "720p" | "1080p";
type AspectRatio = "9:16" | "1:1" | "16:9";

const aspectRatioConfig: Record<AspectRatio, { label: string; icon: React.ReactNode; w: number; h: number; platform: string }> = {
  "9:16": { label: "9:16", icon: <Smartphone className="w-4 h-4" />, w: 1080, h: 1920, platform: "TikTok / Reels / Shorts" },
  "1:1": { label: "1:1", icon: <Square className="w-4 h-4" />, w: 1080, h: 1080, platform: "Instagram Feed / Carrossel" },
  "16:9": { label: "16:9", icon: <Monitor className="w-4 h-4" />, w: 1920, h: 1080, platform: "YouTube / Landscape" },
};

export default function ExportPanel() {
  const { videoUrl, captions, effects, bRollImages, videoDuration, status, setStatus } =
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

      const mimeType = format === "webm" ? "video/webm;codecs=vp9" : "video/webm";
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

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType)
          ? mimeType
          : "video/webm",
        videoBitsPerSecond: quality === "1080p" ? 8000000 : 4000000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const exportDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
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

        for (const effect of activeEffects) {
          const p =
            (time - effect.startTime) / (effect.endTime - effect.startTime);
          const params = effect.params as Record<string, number>;

          switch (effect.type) {
            case "zoom-in": {
              const targetScale = params.scale || 1.3;
              const eased = 1 - Math.pow(1 - p, 3);
              scale *= 1 + (targetScale - 1) * eased;
              const fx = (params.focusX || 0.5) - 0.5;
              const fy = (params.focusY || 0.4) - 0.5;
              tx -= fx * (scale - 1) * width;
              ty -= fy * (scale - 1) * height;
              break;
            }
            case "zoom-out": {
              const targetScale = params.scale || 1.3;
              const eased = 1 - Math.pow(1 - p, 3);
              scale *= targetScale - (targetScale - 1) * eased;
              break;
            }
            case "zoom-pulse": {
              const targetScale = params.scale || 1.2;
              scale *= 1 + (targetScale - 1) * Math.sin(p * Math.PI);
              break;
            }
            case "pan-left":
              tx -= (params.distance || 30) * p;
              break;
            case "pan-right":
              tx += (params.distance || 30) * p;
              break;
            case "shake": {
              const intensity = params.intensity || 3;
              const freq = params.frequency || 15;
              tx += Math.sin(p * freq * Math.PI * 2) * intensity;
              ty += Math.cos(p * freq * Math.PI * 2 + 1) * intensity;
              break;
            }
          }
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

            // Fade in/out at edges
            let bOpacity = 1;
            if (bProgress < 0.15) bOpacity = bProgress / 0.15;
            else if (bProgress > 0.85) bOpacity = (1 - bProgress) / 0.15;

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

        // Draw vignette
        if (activeEffects.some((e) => e.type === "vignette")) {
          const gradient = ctx.createRadialGradient(
            width / 2, height / 2, width * 0.3,
            width / 2, height / 2, width * 0.8
          );
          gradient.addColorStop(0, "transparent");
          gradient.addColorStop(1, "rgba(0,0,0,0.4)");
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

          const y =
            caption.style.position === "top"
              ? height * 0.12
              : caption.style.position === "center"
              ? height / 2
              : height * 0.88;

          const words = caption.text.split(" ");
          const totalWords = words.length;
          // Weight each word by character length for more natural karaoke timing
          let currentWordIndex = totalWords - 1;
          if (totalWords > 1) {
            const charLengths = words.map((w) => Math.max(w.length, 1));
            const totalChars = charLengths.reduce((a, b) => a + b, 0);
            let cumulative = 0;
            for (let i = 0; i < totalWords; i++) {
              cumulative += charLengths[i] / totalChars;
              if (captionProgress < cumulative) { currentWordIndex = i; break; }
            }
          }

          // Calculate total text width for centering
          const spaceWidth = ctx.measureText(" ").width;
          const wordWidths = words.map((w) => ctx.measureText(w).width);
          const totalTextWidth =
            wordWidths.reduce((a, b) => a + b, 0) +
            spaceWidth * (words.length - 1);

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

          // Draw words with word-by-word highlighting
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

            // Determine color
            let wordColor = caption.style.color;
            if (isActive) {
              wordColor = "#FFD700"; // Gold highlight for current word
            } else if (isEmphasis) {
              wordColor = "#FFD700";
            } else if (!isPast) {
              // Future words: slightly dimmed
              wordColor = caption.style.color + "99";
            }

            // Shadow for active word
            if (isActive) {
              ctx.shadowColor = "#FFD70080";
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

          ctx.restore();
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
      a.download = `cineai-export-${aspectRatio.replace(":", "x")}.webm`;
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
  }, [videoUrl, captions, effects, bRollImages, videoDuration, format, quality, aspectRatio, setStatus]);

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
