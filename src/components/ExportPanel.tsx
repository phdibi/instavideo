"use client";

import { useState, useCallback, useRef } from "react";
import { Download, Loader2, Film } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { getCurrentMode } from "@/lib/modes";
import { getTrackById } from "@/lib/musicLibrary";

export default function ExportPanel() {
  const {
    videoUrl,
    videoDuration,
    modeSegments,
    phraseCaptions,
    musicConfig,
    selectedMusicTrack,
    status,
    setStatus,
  } = useProjectStore();

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleExport = useCallback(async () => {
    if (!videoUrl || exporting) return;

    setExporting(true);
    setProgress(0);
    setStatus("exporting", "Exportando vídeo...");

    const WIDTH = 1080;
    const HEIGHT = 1920;
    const FPS = 30;

    try {
      // Create offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d")!;

      // Load presenter video
      const video = document.createElement("video");
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve();
        video.load();
      });

      // Pre-load b-roll videos
      const brollVideos: Record<string, HTMLVideoElement> = {};
      const brollSegments = modeSegments.filter(
        (s) => s.mode === "broll" && s.brollVideoUrl
      );
      await Promise.all(
        brollSegments.map(
          (seg) =>
            new Promise<void>((resolve) => {
              const bv = document.createElement("video");
              bv.src = seg.brollVideoUrl!;
              bv.muted = true;
              bv.playsInline = true;
              bv.crossOrigin = "anonymous";
              bv.onloadeddata = () => {
                brollVideos[seg.id] = bv;
                resolve();
              };
              bv.onerror = () => resolve(); // Skip failed loads
              bv.load();
            })
        )
      );

      // Set up audio
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();

      // Voice audio from video
      const voiceSource = audioCtx.createMediaElementSource(video);
      voiceSource.connect(dest);
      voiceSource.connect(audioCtx.destination);

      // Music audio
      let musicGain: GainNode | null = null;
      if (selectedMusicTrack) {
        const track = getTrackById(selectedMusicTrack);
        if (track) {
          try {
            const musicResponse = await fetch(track.file);
            const musicBuffer = await audioCtx.decodeAudioData(
              await musicResponse.arrayBuffer()
            );
            const musicSource = audioCtx.createBufferSource();
            musicSource.buffer = musicBuffer;
            musicSource.loop = true;
            musicGain = audioCtx.createGain();
            musicGain.gain.value = musicConfig.baseVolume;
            musicSource.connect(musicGain);
            musicGain.connect(dest);
            musicSource.start(0);
          } catch (e) {
            console.warn("Failed to load music for export:", e);
          }
        }
      }

      // Combine canvas + audio into MediaRecorder
      const canvasStream = canvas.captureStream(FPS);
      for (const track of dest.stream.getAudioTracks()) {
        canvasStream.addTrack(track);
      }

      const mimeType = MediaRecorder.isTypeSupported("video/mp4; codecs=avc1")
        ? "video/mp4; codecs=avc1"
        : "video/webm; codecs=vp9";

      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const exportPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start(100);

      // Render loop
      const totalFrames = Math.ceil(videoDuration * FPS);
      video.currentTime = 0;
      await new Promise<void>((r) => {
        video.onseeked = () => r();
      });
      video.play();

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / FPS;

        // Seek video
        if (Math.abs(video.currentTime - time) > 0.1) {
          video.currentTime = time;
          await new Promise<void>((r) => {
            video.onseeked = () => r();
          });
        }

        // Get current mode
        const segment = getCurrentMode(modeSegments, time);
        const mode = segment?.mode || "presenter";

        // Clear canvas
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        // Music ducking
        if (musicGain) {
          let vol = musicConfig.baseVolume;
          switch (mode) {
            case "presenter":
              vol = musicConfig.duckVolume;
              break;
            case "broll":
              vol = 0.6;
              break;
            case "typography":
              vol = 0.3;
              break;
          }
          // Fade out at end
          if (time > videoDuration - musicConfig.fadeOutDuration) {
            const fadeProgress =
              (videoDuration - time) / musicConfig.fadeOutDuration;
            vol *= Math.max(0, fadeProgress);
          }
          musicGain.gain.value = vol;
        }

        if (mode === "presenter") {
          // Black background
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          // Presenter video centered, rounded, 50% height
          const presenterH = HEIGHT * 0.5;
          const presenterW = WIDTH * 0.85;
          const px = (WIDTH - presenterW) / 2;
          const py = (HEIGHT - presenterH) / 2;

          // Ken Burns
          const segDur = segment
            ? segment.endTime - segment.startTime
            : 1;
          const segProgress = segment
            ? Math.min((time - segment.startTime) / segDur, 1)
            : 0;
          const scale = 1 + segProgress * 0.03;

          ctx.save();
          // Rounded rect clip
          roundedRect(ctx, px, py, presenterW, presenterH, 18);
          ctx.clip();

          // Scale from center
          const cx = px + presenterW / 2;
          const cy = py + presenterH / 2;
          ctx.translate(cx, cy);
          ctx.scale(scale, scale);
          ctx.translate(-cx, -cy);

          // Draw video (cover crop)
          drawVideoCover(ctx, video, px, py, presenterW, presenterH);

          ctx.restore();
        } else if (mode === "broll") {
          // B-roll fullscreen
          const brollVid = segment ? brollVideos[segment.id] : null;
          if (brollVid && brollVid.readyState >= 2) {
            drawVideoCover(ctx, brollVid, 0, 0, WIDTH, HEIGHT);
          } else {
            ctx.fillStyle = "#0a0a0a";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
          }

          // Dark overlay
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);
        } else if (mode === "typography") {
          // Typography card
          const bg = segment?.typographyBackground || "#F5F0E8";
          const textColor = bg === "#F5F0E8" ? "#0a0a0a" : "#F5F0E8";
          const text = segment?.typographyText || "";

          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          // Word-by-word animation
          const words = text.toUpperCase().split(" ").filter((w) => w.length > 0);
          const elapsed = segment ? time - segment.startTime : 0;
          const fontSize = Math.min(72, WIDTH * 0.08);

          ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = textColor;

          const lineHeight = fontSize * 1.2;
          const totalTextHeight = words.length > 3
            ? lineHeight * Math.ceil(words.length / 2)
            : lineHeight;
          const startY = HEIGHT / 2 - totalTextHeight / 2;

          words.forEach((word, i) => {
            const wordDelay = i * 0.08;
            if (elapsed < wordDelay) return;

            const wordProgress = Math.min((elapsed - wordDelay) / 0.15, 1);
            const scale = wordProgress;
            const alpha = wordProgress;

            const row = words.length > 3 ? Math.floor(i / 2) : 0;
            const col = words.length > 3 ? i % 2 : i;
            const x = words.length > 3
              ? WIDTH / 2 + (col - 0.5) * fontSize * 3
              : WIDTH / 2;
            const y = startY + row * lineHeight + lineHeight / 2;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.fillText(word, 0, 0);
            ctx.restore();
          });
        }

        // Captions on top (all modes)
        const activeCaption = phraseCaptions.find(
          (c) => time >= c.startTime && time < c.endTime
        );
        if (activeCaption) {
          const captionFontSize = 48;
          ctx.font = `800 ${captionFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const captionY = HEIGHT * 0.85;

          // Text shadow
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillText(activeCaption.text, WIDTH / 2 + 2, captionY + 2);

          // Main text
          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(activeCaption.text, WIDTH / 2, captionY);
        }

        setProgress(Math.round((frame / totalFrames) * 100));

        // Wait for next frame timing
        await new Promise((r) => setTimeout(r, 1000 / FPS));
      }

      video.pause();
      recorder.stop();
      await exportPromise;

      // Download
      const blob = new Blob(chunks, {
        type: mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cineai-export.${mimeType.startsWith("video/mp4") ? "mp4" : "webm"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      audioCtx.close();
      setStatus("ready", "Export concluído!");
    } catch (error) {
      console.error("Export error:", error);
      setStatus("ready", "Erro no export");
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [
    videoUrl,
    videoDuration,
    modeSegments,
    phraseCaptions,
    musicConfig,
    selectedMusicTrack,
    exporting,
    setStatus,
  ]);

  return (
    <div className="p-4 space-y-6">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Exportar Vídeo
      </h3>

      {/* Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Film className="w-4 h-4" />
          <span>1080 × 1920 (9:16)</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span>{modeSegments.length} segmentos</span>
          <span>•</span>
          <span>{phraseCaptions.length} legendas</span>
        </div>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exporting || !videoUrl}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
          exporting
            ? "bg-blue-500/20 text-blue-400 cursor-not-allowed"
            : "bg-blue-500 text-white hover:bg-blue-600 active:scale-[0.98]"
        }`}
      >
        {exporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Exportando... {progress}%
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Exportar Vídeo
          </>
        )}
      </button>

      {/* Progress bar */}
      {exporting && (
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// Helper: draw rounded rectangle path
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper: draw video covering the given rect (center crop)
function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const targetRatio = dw / dh;
  const videoRatio = vw / vh;

  let sx = 0,
    sy = 0,
    sw = vw,
    sh = vh;

  if (videoRatio > targetRatio) {
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / targetRatio;
    sy = (vh - sh) / 2;
  }

  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
}
