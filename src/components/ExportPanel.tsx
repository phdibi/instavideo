"use client";

import { useState, useCallback } from "react";
import { Download, Loader2, Film } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { getCurrentMode } from "@/lib/modes";
import { getTrackById } from "@/lib/musicLibrary";
import { computeBRollEffect } from "@/lib/brollEffects";
import { getCanvasFontName } from "@/lib/fonts";
import { renderSFXToBuffer } from "@/lib/sfx";

export default function ExportPanel() {
  const {
    videoUrl,
    videoDuration,
    modeSegments,
    phraseCaptions,
    musicConfig,
    selectedMusicTrack,
    captionConfig,
    stanzaConfig,
    sfxConfig,
    sfxMarkers,
    setStatus,
  } = useProjectStore();

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExport = useCallback(async () => {
    if (!videoUrl || exporting) return;

    setExporting(true);
    setProgress(0);
    setStatus("exporting", "Exportando vídeo...");

    const WIDTH = 1080;
    const HEIGHT = 1920;
    const FPS = 30;
    let audioCtx: AudioContext | null = null;

    try {
      // Wait for fonts to be ready
      await document.fonts.ready;

      // Create offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context não disponível");

      /** Seek with timeout to prevent infinite hang */
      const seekVideo = (vid: HTMLVideoElement, t: number) =>
        new Promise<void>((resolve) => {
          vid.currentTime = t;
          const timer = setTimeout(resolve, 3000);
          vid.onseeked = () => { clearTimeout(timer); resolve(); };
        });

      // Load presenter video
      const video = document.createElement("video");
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout carregando vídeo")), 15000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error("Erro ao carregar vídeo")); };
        video.load();
      });

      // Pre-load background image
      const bgImage = new Image();
      bgImage.src = "/background.png";
      await new Promise<void>((resolve) => {
        bgImage.onload = () => resolve();
        bgImage.onerror = () => resolve(); // fallback: no bg
        setTimeout(resolve, 5000);
      });

      // Pre-load b-roll videos
      const brollVideos: Record<string, HTMLVideoElement> = {};
      const brollImages: Record<string, HTMLImageElement> = {};
      const brollVideoSegments = modeSegments.filter(
        (s) => s.mode === "broll" && s.brollVideoUrl && s.brollMediaType !== "photo"
      );
      const brollPhotoSegments = modeSegments.filter(
        (s) => s.mode === "broll" && s.brollImageUrl && s.brollMediaType === "photo"
      );
      await Promise.all([
        ...brollVideoSegments.map(
          (seg) =>
            new Promise<void>((resolve) => {
              const bv = document.createElement("video");
              bv.src = seg.brollVideoUrl!;
              bv.muted = true;
              bv.playsInline = true;
              bv.crossOrigin = "anonymous";
              const timer = setTimeout(resolve, 10000);
              bv.onloadeddata = () => {
                clearTimeout(timer);
                brollVideos[seg.id] = bv;
                resolve();
              };
              bv.onerror = () => { clearTimeout(timer); resolve(); };
              bv.load();
            })
        ),
        ...brollPhotoSegments.map(
          (seg) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              const timer = setTimeout(resolve, 10000);
              img.onload = () => {
                clearTimeout(timer);
                brollImages[seg.id] = img;
                resolve();
              };
              img.onerror = () => { clearTimeout(timer); resolve(); };
              img.src = seg.brollImageUrl!;
            })
        ),
      ]);

      // Set up audio
      audioCtx = new AudioContext();
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

      // SFX — render transition sounds into the audio stream
      if (sfxConfig.profile !== "none") {
        try {
          // Create a short SFX buffer and play it alongside
          const sfxDuration = Math.max(2, videoDuration + 1);
          const offlineCtx = new OfflineAudioContext(
            2,
            Math.ceil(sfxDuration * audioCtx.sampleRate),
            audioCtx.sampleRate
          );
          await renderSFXToBuffer(offlineCtx, modeSegments, sfxConfig.masterVolume, sfxMarkers);
          const sfxBuffer = await offlineCtx.startRendering();

          const sfxSource = audioCtx.createBufferSource();
          sfxSource.buffer = sfxBuffer;
          sfxSource.connect(dest);
          sfxSource.start(0);
        } catch (e) {
          console.warn("SFX render failed:", e);
        }
      }

      // Combine canvas + audio into MediaRecorder
      const canvasStream = canvas.captureStream(FPS);
      for (const track of dest.stream.getAudioTracks()) {
        canvasStream.addTrack(track);
      }

      const mimeType = MediaRecorder.isTypeSupported("video/mp4; codecs=avc1")
        ? "video/mp4; codecs=avc1"
        : MediaRecorder.isTypeSupported("video/webm; codecs=vp9")
          ? "video/webm; codecs=vp9"
          : "video/webm";

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

      // Render loop — pre-compute stanza values (avoid per-frame lookups)
      const stanzaEmphFont = getCanvasFontName(stanzaConfig.emphasisFontFamily);
      const stanzaNormFont = getCanvasFontName(stanzaConfig.normalFontFamily);
      const isCascading = stanzaConfig.stanzaLayout === "cascading";
      const stanzaBaseY = isCascading
        ? HEIGHT * 0.78
        : captionConfig.position === "top"
          ? HEIGHT * 0.15
          : captionConfig.position === "center"
            ? HEIGHT * 0.5
            : HEIGHT * 0.85;
      const stanzaBaseX = isCascading ? WIDTH * 0.06 : WIDTH / 2;
      const stanzaEmphSize = isCascading
        ? stanzaConfig.emphasisFontSize * 1.2
        : stanzaConfig.emphasisFontSize;
      const totalFrames = Math.ceil(videoDuration * FPS);
      await seekVideo(video, 0);
      video.play();

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / FPS;

        // Seek video
        if (Math.abs(video.currentTime - time) > 0.1) {
          await seekVideo(video, time);
        }

        // Get current mode
        const segment = getCurrentMode(modeSegments, time);
        const mode = segment?.mode || "presenter";
        const layout = segment?.brollLayout || "fullscreen";

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
          if (time > videoDuration - musicConfig.fadeOutDuration) {
            const fadeProgress =
              (videoDuration - time) / musicConfig.fadeOutDuration;
            vol *= Math.max(0, fadeProgress);
          }
          musicGain.gain.value = vol;
        }

        // Seek b-roll video to correct time within this frame
        if (mode === "broll" && segment) {
          const bv = brollVideos[segment.id];
          if (bv && bv.readyState >= 2) {
            const brollElapsed = time - segment.startTime;
            const safeDuration = Number.isFinite(bv.duration) && bv.duration > 0 ? bv.duration : 1;
            const brollTime = brollElapsed % safeDuration;
            if (Math.abs(bv.currentTime - brollTime) > 0.15) {
              await seekVideo(bv, brollTime);
            }
          }
        }

        if (mode === "presenter") {
          // Draw background image behind presenter
          if (bgImage.complete && bgImage.naturalWidth > 0) {
            drawMediaCover(ctx, bgImage, 0, 0, WIDTH, HEIGHT);
          }

          // Presenter fills entire 9:16 frame with dynamic Ken Burns
          const presenterSegs = modeSegments.filter((s) => s.mode === "presenter");
          const presenterIndex = segment ? presenterSegs.findIndex((s) => s.id === segment.id) : 0;
          const segDur = segment ? segment.endTime - segment.startTime : 1;
          const segProgress = segment ? Math.min((time - segment.startTime) / segDur, 1) : 0;
          const zoomIn = presenterIndex % 2 === 0;
          const scale = zoomIn ? 1 + segProgress * 0.06 : 1.06 - segProgress * 0.06;

          ctx.save();
          ctx.translate(WIDTH / 2, HEIGHT / 2);
          ctx.scale(scale, scale);
          ctx.translate(-WIDTH / 2, -HEIGHT / 2);
          drawVideoCover(ctx, video, 0, 0, WIDTH, HEIGHT);
          ctx.restore();
        } else if (mode === "broll") {
          const isPhoto = segment?.brollMediaType === "photo";
          const brollVid = (!isPhoto && segment) ? brollVideos[segment.id] : null;
          const brollImg = (isPhoto && segment) ? brollImages[segment.id] : null;
          const hasBroll = (brollVid && brollVid.readyState >= 2) || !!brollImg;
          const brollMedia = brollImg || brollVid;

          // Compute effect transform once (shared across all layouts)
          const segDur = segment ? segment.endTime - segment.startTime : 1;
          const segProgress = segment ? Math.min((time - segment.startTime) / segDur, 1) : 0;
          const transform = computeBRollEffect(
            segment?.brollEffect || "static",
            segProgress,
            segment?.brollEffectIntensity ?? 1.0
          );

          if (layout === "split") {
            // ── Split: presenter left, b-roll right ──
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, WIDTH / 2, HEIGHT);
            ctx.clip();
            drawVideoCover(ctx, video, 0, 0, WIDTH / 2, HEIGHT);
            ctx.restore();

            if (hasBroll && brollMedia) {
              ctx.save();
              ctx.beginPath();
              ctx.rect(WIDTH / 2, 0, WIDTH / 2, HEIGHT);
              ctx.clip();
              ctx.translate(WIDTH * 0.75, HEIGHT / 2);
              ctx.scale(transform.scale, transform.scale);
              ctx.translate(
                -WIDTH * 0.25 + (transform.translateX / 100) * (WIDTH / 2),
                -HEIGHT / 2 + (transform.translateY / 100) * HEIGHT
              );
              drawMediaCover(ctx, brollMedia, 0, 0, WIDTH / 2, HEIGHT);
              ctx.restore();
            }

            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(WIDTH / 2 - 1, 0, 2, HEIGHT);

          } else if (layout === "overlay") {
            // ── Overlay: presenter background + b-roll card ──
            drawVideoCover(ctx, video, 0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = "rgba(0,0,0,0.15)";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            if (hasBroll && brollMedia) {
              const entryProg = Math.min((time - (segment?.startTime || 0)) / 0.3, 1);
              const cardScale = 0.85 + entryProg * 0.15;
              const cardW = WIDTH * 0.84;
              const cardH = HEIGHT * 0.42;
              const cardX = (WIDTH - cardW) / 2;
              const cardY = HEIGHT * 0.38;
              const cornerR = 24;

              // Card with shadow
              ctx.save();
              ctx.shadowColor = "rgba(0,0,0,0.4)";
              ctx.shadowBlur = 30;
              ctx.shadowOffsetY = 8;
              ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
              ctx.scale(cardScale * transform.scale, cardScale * transform.scale);
              ctx.translate(-cardW / 2, -cardH / 2);
              roundedRect(ctx, 0, 0, cardW, cardH, cornerR);
              ctx.clip();
              ctx.translate(
                (transform.translateX / 100) * cardW,
                (transform.translateY / 100) * cardH
              );
              drawMediaCover(ctx, brollMedia, 0, 0, cardW, cardH);
              ctx.fillStyle = "rgba(0,0,0,0.08)";
              ctx.fillRect(0, 0, cardW, cardH);
              ctx.restore();

              // Card border
              ctx.save();
              ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
              ctx.scale(cardScale, cardScale);
              ctx.translate(-cardW / 2, -cardH / 2);
              roundedRect(ctx, 0, 0, cardW, cardH, cornerR);
              ctx.strokeStyle = "rgba(255,255,255,0.15)";
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.restore();
            }

          } else if (layout === "pip") {
            // ── PIP: b-roll fullscreen, presenter in circle ──
            if (hasBroll && brollMedia) {
              ctx.save();
              ctx.translate(WIDTH / 2, HEIGHT / 2);
              ctx.scale(transform.scale, transform.scale);
              ctx.translate(
                -WIDTH / 2 + (transform.translateX / 100) * WIDTH,
                -HEIGHT / 2 + (transform.translateY / 100) * HEIGHT
              );
              drawMediaCover(ctx, brollMedia, 0, 0, WIDTH, HEIGHT);
              ctx.restore();
            }
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            // Draw presenter in circle (bottom-right)
            const pipSize = WIDTH * 0.25;
            const pipX = WIDTH - pipSize - WIDTH * 0.04;
            const pipY = HEIGHT - pipSize - HEIGHT * 0.04;
            ctx.save();
            ctx.beginPath();
            ctx.arc(pipX + pipSize / 2, pipY + pipSize / 2, pipSize / 2, 0, Math.PI * 2);
            ctx.clip();
            drawVideoCover(ctx, video, pipX, pipY, pipSize, pipSize);
            ctx.restore();
            // PIP border
            ctx.beginPath();
            ctx.arc(pipX + pipSize / 2, pipY + pipSize / 2, pipSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth = 3;
            ctx.stroke();

          } else if (layout === "cinematic") {
            // ── Cinematic: b-roll with letterbox bars ──
            if (hasBroll && brollMedia) {
              ctx.save();
              ctx.translate(WIDTH / 2, HEIGHT / 2);
              ctx.scale(transform.scale, transform.scale);
              ctx.translate(
                -WIDTH / 2 + (transform.translateX / 100) * WIDTH,
                -HEIGHT / 2 + (transform.translateY / 100) * HEIGHT
              );
              drawMediaCover(ctx, brollMedia, 0, 0, WIDTH, HEIGHT);
              ctx.restore();
            }
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            // Letterbox bars (12% top and bottom)
            const barH = HEIGHT * 0.12;
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, WIDTH, barH);
            ctx.fillRect(0, HEIGHT - barH, WIDTH, barH);

          } else if (layout === "diagonal") {
            // ── Diagonal: presenter left triangle, b-roll right triangle ──
            // Presenter side
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(WIDTH * 0.6, 0);
            ctx.lineTo(WIDTH * 0.4, HEIGHT);
            ctx.lineTo(0, HEIGHT);
            ctx.closePath();
            ctx.clip();
            drawVideoCover(ctx, video, 0, 0, WIDTH, HEIGHT);
            ctx.restore();

            // B-roll side
            if (hasBroll && brollMedia) {
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(WIDTH * 0.6, 0);
              ctx.lineTo(WIDTH, 0);
              ctx.lineTo(WIDTH, HEIGHT);
              ctx.lineTo(WIDTH * 0.4, HEIGHT);
              ctx.closePath();
              ctx.clip();
              ctx.translate(WIDTH / 2, HEIGHT / 2);
              ctx.scale(transform.scale, transform.scale);
              ctx.translate(
                -WIDTH / 2 + (transform.translateX / 100) * WIDTH,
                -HEIGHT / 2 + (transform.translateY / 100) * HEIGHT
              );
              drawMediaCover(ctx, brollMedia, 0, 0, WIDTH, HEIGHT);
              ctx.restore();
            }

            // Diagonal divider line
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(WIDTH * 0.6, 0);
            ctx.lineTo(WIDTH * 0.4, HEIGHT);
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();

          } else {
            // ── Fullscreen (default) ──
            if (hasBroll && brollMedia) {
              ctx.save();
              ctx.translate(WIDTH / 2, HEIGHT / 2);
              ctx.scale(transform.scale, transform.scale);
              ctx.translate(
                -WIDTH / 2 + (transform.translateX / 100) * WIDTH,
                -HEIGHT / 2 + (transform.translateY / 100) * HEIGHT
              );
              drawMediaCover(ctx, brollMedia, 0, 0, WIDTH, HEIGHT);
              ctx.restore();
            } else {
              ctx.fillStyle = "#0a0a0a";
              ctx.fillRect(0, 0, WIDTH, HEIGHT);
            }

            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
          }
        } else if (mode === "typography") {
          // Typography card
          const bg = segment?.typographyBackground || "#F5F0E8";
          const textColor = bg === "#F5F0E8" ? "#0a0a0a" : "#F5F0E8";
          const text = segment?.typographyText || "";
          const typoAnim = segment?.typographyAnimation || "pop-in";
          const typoStagger = (segment?.typographyStagger ?? 80) / 1000;

          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, WIDTH, HEIGHT);

          const elapsed = segment ? time - segment.startTime : 0;
          const fontSize = Math.min(72, WIDTH * 0.08);

          ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = textColor;

          if (typoAnim === "typewriter") {
            // Character by character
            const chars = text.toUpperCase();
            const charStagger = typoStagger * 0.3;
            const visibleCount = Math.min(
              Math.floor(elapsed / charStagger),
              chars.length
            );
            const visibleText = chars.slice(0, visibleCount);
            ctx.fillText(visibleText, WIDTH / 2, HEIGHT / 2);
          } else {
            // Word-by-word animations
            const words = text.toUpperCase().split(" ").filter((w) => w.length > 0);
            const lineHeight = fontSize * 1.2;
            const totalTextHeight = words.length > 3
              ? lineHeight * Math.ceil(words.length / 2)
              : lineHeight;
            const startY = HEIGHT / 2 - totalTextHeight / 2;

            words.forEach((word, i) => {
              const wordDelay = i * typoStagger;
              if (elapsed < wordDelay) return;

              const wordProgress = Math.min((elapsed - wordDelay) / 0.15, 1);

              const row = words.length > 3 ? Math.floor(i / 2) : 0;
              const col = words.length > 3 ? i % 2 : i;
              const x = words.length > 3
                ? WIDTH / 2 + (col - 0.5) * fontSize * 3
                : WIDTH / 2;
              const y = startY + row * lineHeight + lineHeight / 2;

              ctx.save();
              ctx.globalAlpha = wordProgress;

              if (typoAnim === "pop-in") {
                ctx.translate(x, y);
                ctx.scale(wordProgress, wordProgress);
                ctx.fillText(word, 0, 0);
              } else if (typoAnim === "fade-up") {
                const offsetY = (1 - wordProgress) * 20;
                ctx.translate(x, y + offsetY);
                ctx.fillText(word, 0, 0);
              } else if (typoAnim === "slide-in") {
                const offsetX = (1 - wordProgress) * -WIDTH * 0.3;
                ctx.translate(x + offsetX, y);
                ctx.fillText(word, 0, 0);
              } else {
                ctx.translate(x, y);
                ctx.scale(wordProgress, wordProgress);
                ctx.fillText(word, 0, 0);
              }

              ctx.restore();
            });
          }
        }

        // Captions on top (all modes) — using captionConfig
        const activeCaptions = phraseCaptions.filter(
          (c) => time >= c.startTime && time < c.endTime
        );
        const isStanza = activeCaptions.length > 1 && activeCaptions[0]?.stanzaId;

        if (isStanza) {
          // Stacked stanza rendering — multiple words with mixed typography
          ctx.textAlign = isCascading ? "left" : "center";
          ctx.textBaseline = "middle";

          // Calculate line heights for each caption
          const normalSize = stanzaConfig.normalFontSize;
          const lines = activeCaptions.map((cap, index) => {
            const size = cap.isEmphasis ? stanzaEmphSize : normalSize;
            const indent = isCascading
              ? Math.min(index * WIDTH * 0.05 + (cap.isEmphasis ? -WIDTH * 0.015 : 0), WIDTH * 0.4)
              : 0;
            return { caption: cap, fontSize: size, lineHeight: size * 1.2, indent };
          });
          const totalHeight = lines.reduce((sum, l) => sum + l.lineHeight, 0);
          let currentY = stanzaBaseY - totalHeight / 2;

          for (const line of lines) {
            const { caption: cap, fontSize: fSize } = line;
            const fontName = cap.isEmphasis ? stanzaEmphFont : stanzaNormFont;
            const weight = cap.isEmphasis ? "italic 700" : "400";
            ctx.font = `${weight} ${fSize}px ${fontName}, system-ui, sans-serif`;

            const displayText = captionConfig.uppercase
              ? cap.text.toUpperCase()
              : cap.text;

            const drawY = currentY + line.lineHeight / 2;

            // Shadow
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;

            // Main text
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(displayText, stanzaBaseX + line.indent, drawY);

            // Reset shadow
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            currentY += line.lineHeight;
          }
        } else if (activeCaptions.length > 0) {
          const activeCaption = activeCaptions[0];
          const cFont = getCanvasFontName(captionConfig.fontFamily);
          const cSize = captionConfig.fontSize;
          ctx.font = `${captionConfig.fontWeight} ${cSize}px ${cFont}, Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Position
          let captionY = HEIGHT * 0.85; // bottom
          if (captionConfig.position === "top") captionY = HEIGHT * 0.15;
          else if (captionConfig.position === "center") captionY = HEIGHT * 0.5;

          const displayText = captionConfig.uppercase
            ? activeCaption.text.toUpperCase()
            : activeCaption.text;

          // Shadow
          if (captionConfig.shadowBlur > 0) {
            ctx.shadowColor = captionConfig.shadowColor;
            ctx.shadowBlur = captionConfig.shadowBlur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
          }

          // Stroke
          if (captionConfig.strokeWidth > 0) {
            ctx.strokeStyle = captionConfig.strokeColor;
            ctx.lineWidth = captionConfig.strokeWidth * 2;
            ctx.lineJoin = "round";
            ctx.strokeText(displayText, WIDTH / 2, captionY);
          }

          // Main text
          ctx.fillStyle = captionConfig.color;
          ctx.fillText(displayText, WIDTH / 2, captionY);

          // Reset shadow
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
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

      setStatus("ready", "Export concluído!");
    } catch (error) {
      console.error("Export error:", error);
      setStatus("ready", "Erro no export");
    } finally {
      try { audioCtx?.close(); } catch { /* already closed */ }
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
    captionConfig,
    stanzaConfig,
    sfxConfig,
    sfxMarkers,
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

// Helper: draw video or image covering the given rect (center crop)
function drawMediaCover(
  ctx: CanvasRenderingContext2D,
  media: HTMLVideoElement | HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const isVideo = media instanceof HTMLVideoElement;
  const mw = isVideo ? media.videoWidth : media.naturalWidth;
  const mh = isVideo ? media.videoHeight : media.naturalHeight;
  if (!mw || !mh) return;

  const targetRatio = dw / dh;
  const mediaRatio = mw / mh;

  let sx = 0, sy = 0, sw = mw, sh = mh;
  if (mediaRatio > targetRatio) {
    sw = mh * targetRatio;
    sx = (mw - sw) / 2;
  } else {
    sh = mw / targetRatio;
    sy = (mh - sh) / 2;
  }

  ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
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
