"use client";

import { useState, useCallback, useRef } from "react";
import { Download, Loader2, Film } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { getCurrentMode } from "@/lib/modes";
import { getTrackById } from "@/lib/musicLibrary";
import { computeBRollEffect, computePresenterEffect } from "@/lib/brollEffects";
import { getCanvasFontName } from "@/lib/fonts";
import { wrapText, roundedRect, drawMediaCover, drawVideoCover } from "@/lib/canvasHelpers";
import { renderSFXToBuffer } from "@/lib/sfx";
import { createVoiceEnhancerChain } from "@/lib/voiceEnhancer";
import { getTransitionAlpha } from "@/lib/transitions";
import {
  probeWebCodecs,
  seekVideo as seekVideoToTime,
  createMuxerBundle,
  encodeAudio,
  encodeVideoFrame,
  finalizeMuxer,
  type WebCodecsConfig,
} from "@/lib/webcodecExporter";
import {
  REF_WIDTH,
  CASCADE_EMPH_SCALE,
  CASCADE_INDENT_STEP,
  CASCADE_EMPH_NUDGE,
  CASCADE_MAX_INDENT,
  DIAGONAL_BASE_X,
  DIAGONAL_BASE_BOTTOM_Y,
  DIAGONAL_STEP_X,
  DIAGONAL_STEP_Y,
  SCATTERED_X_OFFSET,
  SCATTERED_Y_BASE,
  SCATTERED_Y_RANGE,
  scatteredRand,
  RESOLUTION_PRESETS,
  type ResolutionKey,
} from "@/lib/renderConstants";

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
    stanzaStyleOverrides,
    sfxConfig,
    sfxMarkers,
    voiceEnhanceConfig,
    setStatus,
    exportResolution,
    setExportResolution,
    exportQuality,
    setExportQuality,
    customMusicTracks,
  } = useProjectStore(
    useShallow((s) => ({
      videoUrl: s.videoUrl,
      videoDuration: s.videoDuration,
      modeSegments: s.modeSegments,
      phraseCaptions: s.phraseCaptions,
      musicConfig: s.musicConfig,
      selectedMusicTrack: s.selectedMusicTrack,
      captionConfig: s.captionConfig,
      stanzaConfig: s.stanzaConfig,
      stanzaStyleOverrides: s.stanzaStyleOverrides,
      sfxConfig: s.sfxConfig,
      sfxMarkers: s.sfxMarkers,
      voiceEnhanceConfig: s.voiceEnhanceConfig,
      setStatus: s.setStatus,
      exportResolution: s.exportResolution,
      setExportResolution: s.setExportResolution,
      exportQuality: s.exportQuality,
      setExportQuality: s.setExportQuality,
      customMusicTracks: s.customMusicTracks,
    }))
  );

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const exportingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleExport = useCallback(async () => {
    if (!videoUrl || exportingRef.current) return;
    exportingRef.current = true;

    const abortController = new AbortController();
    abortRef.current = abortController;
    const signal = abortController.signal;

    setExporting(true);
    setProgress(0);
    setStatus("exporting", "Exportando vídeo...");

    const preset = RESOLUTION_PRESETS[exportResolution] || RESOLUTION_PRESETS["1080x1920"];
    const WIDTH = preset.width;
    const HEIGHT = preset.height;
    const FPS = 30;
    let audioCtx: AudioContext | null = null;

    try {
      // Wait for fonts to be ready
      await document.fonts.ready;

      // Create offscreen canvas with high-quality rendering
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d", { alpha: false })!;
      if (!ctx) throw new Error("Canvas 2D context não disponível");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Load presenter video
      const video = document.createElement("video");
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      if (!videoUrl.startsWith("blob:")) video.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout carregando vídeo")), 15000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error("Erro ao carregar vídeo")); };
        video.load();
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
              bv.loop = true;
              bv.preload = "auto";
              if (!seg.brollVideoUrl!.startsWith("blob:")) bv.crossOrigin = "anonymous";
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
              if (!seg.brollImageUrl!.startsWith("blob:")) img.crossOrigin = "anonymous";
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

      // ── Offline Audio Pre-Rendering ──
      // Pre-mix ALL audio offline for perfect sync, no real-time dependency.
      // This prevents the mobile truncation issue where video.play() can't keep up.
      setStatus("exporting", "Preparando áudio...");

      audioCtx = new AudioContext({ sampleRate: 48000 });
      // Resume context (mobile browsers may start suspended)
      if (audioCtx.state === "suspended") await audioCtx.resume();

      // 1. Decode voice audio from video file
      let voiceBuffer: AudioBuffer | null = null;
      try {
        const videoArrayBuffer = await fetch(videoUrl).then((r) => r.arrayBuffer());
        voiceBuffer = await audioCtx.decodeAudioData(videoArrayBuffer);
      } catch (e) {
        console.warn("Could not decode voice audio (video may have no audio track):", e);
      }

      // 2. Decode music audio
      let musicBuffer: AudioBuffer | null = null;
      if (selectedMusicTrack) {
        const track = getTrackById(selectedMusicTrack, customMusicTracks);
        if (track) {
          try {
            const musicArrayBuffer = await fetch(track.file).then((r) => r.arrayBuffer());
            musicBuffer = await audioCtx.decodeAudioData(musicArrayBuffer);
          } catch (e) {
            console.warn("Failed to load music for export:", e);
          }
        }
      }

      if (signal.aborted) { setStatus("ready", "Export cancelado"); return; }

      // 3. Pre-mix all audio in OfflineAudioContext (voice + music + SFX)
      setStatus("exporting", "Mixando áudio...");
      const sampleRate = 48000;
      const totalSamples = Math.ceil(videoDuration * sampleRate);
      const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

      // Voice source with optional voice enhancement
      if (voiceBuffer) {
        const voiceSrc = offlineCtx.createBufferSource();
        voiceSrc.buffer = voiceBuffer;
        if (voiceEnhanceConfig.preset !== "off") {
          const chain = createVoiceEnhancerChain(offlineCtx, voiceEnhanceConfig);
          voiceSrc.connect(chain.input);
          chain.output.connect(offlineCtx.destination);
        } else {
          voiceSrc.connect(offlineCtx.destination);
        }
        voiceSrc.start(0);
      }

      // Music source with pre-scheduled ducking (sample-accurate, no per-frame calls)
      if (musicBuffer) {
        const musicSrc = offlineCtx.createBufferSource();
        musicSrc.buffer = musicBuffer;
        musicSrc.loop = true;
        const mGain = offlineCtx.createGain();

        // Fade in from silence
        const fadeInDur = musicConfig.fadeInDuration;
        if (fadeInDur > 0) {
          mGain.gain.setValueAtTime(0, 0);
          mGain.gain.linearRampToValueAtTime(musicConfig.baseVolume, fadeInDur);
        } else {
          mGain.gain.value = musicConfig.baseVolume;
        }

        // Schedule ducking for each mode segment (skip segments within fade-in window)
        for (const seg of modeSegments) {
          let vol = musicConfig.baseVolume;
          if (seg.mode === "presenter") vol = musicConfig.duckVolume;
          else if (seg.mode === "broll") vol = musicConfig.baseVolume * 0.6;
          else if (seg.mode === "typography") vol = musicConfig.baseVolume * 0.3;
          // Small epsilon avoids conflicting with linearRamp ending at fadeInDur
          const duckStart = Math.max(fadeInDur + 0.005, seg.startTime);
          if (duckStart < seg.endTime) {
            mGain.gain.setTargetAtTime(vol, duckStart, 0.08);
          }
        }

        // Fade out at end
        const fadeDur = musicConfig.fadeOutDuration;
        if (fadeDur > 0) {
          const fadeStart = Math.max(0, videoDuration - fadeDur);
          mGain.gain.setTargetAtTime(0, fadeStart, fadeDur / 4);
          mGain.gain.setValueAtTime(0, videoDuration); // guarantee silence at end
        }

        musicSrc.connect(mGain);
        mGain.connect(offlineCtx.destination);
        musicSrc.start(0);
      }

      // SFX
      if (sfxConfig.profile !== "none") {
        try {
          await renderSFXToBuffer(offlineCtx, modeSegments, sfxConfig.masterVolume, sfxMarkers);
        } catch (e) {
          console.warn("SFX render failed:", e);
        }
      }

      const mixedAudio = await offlineCtx.startRendering();

      if (signal.aborted) { setStatus("ready", "Export cancelado"); return; }

      // ── Shared rendering setup ──
      setStatus("exporting", "Renderizando...");

      const presenterSegs = modeSegments.filter((s) => s.mode === "presenter");
      const presenterIndexMap = new Map(presenterSegs.map((s, i) => [s.id, i]));

      const pixels = WIDTH * HEIGHT;
      const videoBps = pixels >= 2_000_000 ? 25_000_000   // 1080p+ → 25 Mbps
                     : pixels >= 1_000_000 ? 16_000_000   // 720p+  → 16 Mbps
                     : 10_000_000;                          // smaller → 10 Mbps

      // ── drawFrameContent: renders one frame at the given time ──
      // Captures all rendering state via closure. Used by both export paths.
      function drawFrameContent(time: number) {
        const segment = getCurrentMode(modeSegments, time);
        const mode = segment?.mode || "presenter";
        const layout = segment?.brollLayout || "fullscreen";

        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        if (mode === "presenter") {
          // Presenter fills entire 9:16 frame with dynamic Ken Burns
          const presenterIndex = segment ? (presenterIndexMap.get(segment.id) ?? 0) : 0;
          const segDur = segment ? segment.endTime - segment.startTime : 1;
          const rawProgress = segment ? Math.min((time - segment.startTime) / segDur, 1) : 0;
          // Remap progress using zoomStart/zoomEnd window (must match VideoPreview)
          const zoomStart = segment?.presenterZoomStart ?? 0;
          const zoomEnd = segment?.presenterZoomEnd ?? 1;
          const segProgress = zoomStart >= zoomEnd
            ? 0
            : Math.min(Math.max((rawProgress - zoomStart) / (zoomEnd - zoomStart), 0), 1);
          const zoomType = segment?.presenterZoom ?? "zoom-in";
          const pTransform = computePresenterEffect(
            zoomType,
            segProgress,
            segment?.presenterZoomIntensity ?? 1.0,
            presenterIndex,
            segment?.presenterZoomEasing ?? "abrupt"
          );

          ctx.save();
          ctx.translate(WIDTH / 2, HEIGHT / 2);
          ctx.scale(pTransform.scale, pTransform.scale);
          ctx.translate(
            -WIDTH / 2 + (pTransform.translateX / 100) * WIDTH,
            -HEIGHT / 2 + (pTransform.translateY / 100) * HEIGHT
          );
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
            ctx.fillStyle = "rgba(0,0,0,0.10)";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            if (hasBroll && brollMedia) {
              const entryProg = Math.min((time - (segment?.startTime || 0)) / 0.15, 1);
              const cardScale = 0.85 + entryProg * 0.15;
              const cardW = WIDTH * 0.84;
              const cardH = HEIGHT * 0.45;
              const cardX = (WIDTH - cardW) / 2;
              const cardY = HEIGHT * 0.40;
              const cornerR = 24;

              // Card with shadow
              ctx.save();
              ctx.shadowColor = "rgba(0,0,0,0.4)";
              ctx.shadowBlur = 30;
              ctx.shadowOffsetX = 0;
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
            // Character by character with word-wrap
            const chars = text.toUpperCase();
            const charStagger = typoStagger * 0.3;
            const visibleCount = Math.min(
              Math.floor(elapsed / charStagger),
              chars.length
            );
            const visibleText = chars.slice(0, visibleCount);
            const maxTextWidth = WIDTH * 0.8;
            const twLines = wrapText(ctx, visibleText, maxTextWidth);
            const twLineHeight = fontSize * 1.3;
            const twTotalH = twLines.length * twLineHeight;
            const twStartY = HEIGHT / 2 - twTotalH / 2 + twLineHeight / 2;
            for (let li = 0; li < twLines.length; li++) {
              ctx.fillText(twLines[li], WIDTH / 2, twStartY + li * twLineHeight);
            }
          } else {
            // Word-by-word animations with proper text-flow layout
            const words = text.toUpperCase().split(" ").filter((w) => w.length > 0);
            const lineHeight = fontSize * 1.3;
            const maxTextWidth = WIDTH * 0.8;
            const wordGap = fontSize * 0.45;

            // Compute word positions using measureText for proper wrapping
            type WordPos = { word: string; x: number; y: number; lineIdx: number };
            const wordPositions: WordPos[] = [];
            let lineWords: { word: string; width: number }[] = [];
            let lineWidth = 0;
            let lineIdx = 0;

            for (const word of words) {
              const w = ctx.measureText(word).width;
              if (lineWords.length > 0 && lineWidth + wordGap + w > maxTextWidth) {
                // Commit current line — center words
                let curX = WIDTH / 2 - lineWidth / 2;
                for (const lw of lineWords) {
                  wordPositions.push({ word: lw.word, x: curX + lw.width / 2, y: 0, lineIdx });
                  curX += lw.width + wordGap;
                }
                lineWords = [{ word, width: w }];
                lineWidth = w;
                lineIdx++;
              } else {
                if (lineWords.length > 0) lineWidth += wordGap;
                lineWords.push({ word, width: w });
                lineWidth += w;
              }
            }
            // Commit last line
            if (lineWords.length > 0) {
              let curX = WIDTH / 2 - lineWidth / 2;
              for (const lw of lineWords) {
                wordPositions.push({ word: lw.word, x: curX + lw.width / 2, y: 0, lineIdx });
                curX += lw.width + wordGap;
              }
            }

            const totalLines = lineIdx + 1;
            const totalTextHeight = totalLines * lineHeight;
            const startY = HEIGHT / 2 - totalTextHeight / 2 + lineHeight / 2;

            // Set Y positions
            for (const wp of wordPositions) {
              wp.y = startY + wp.lineIdx * lineHeight;
            }

            // Animate each word
            for (let i = 0; i < wordPositions.length; i++) {
              const wp = wordPositions[i];
              const wordDelay = i * typoStagger;
              if (elapsed < wordDelay) continue;
              const wordProgress = Math.min((elapsed - wordDelay) / 0.15, 1);

              ctx.save();
              ctx.globalAlpha = wordProgress;
              ctx.textAlign = "center";

              if (typoAnim === "pop-in") {
                ctx.translate(wp.x, wp.y);
                ctx.scale(wordProgress, wordProgress);
                ctx.fillText(wp.word, 0, 0);
              } else if (typoAnim === "fade-up") {
                ctx.translate(wp.x, wp.y + (1 - wordProgress) * 20);
                ctx.fillText(wp.word, 0, 0);
              } else if (typoAnim === "slide-in") {
                ctx.translate(wp.x + (1 - wordProgress) * -WIDTH * 0.3, wp.y);
                ctx.fillText(wp.word, 0, 0);
              } else {
                ctx.translate(wp.x, wp.y);
                ctx.scale(wordProgress, wordProgress);
                ctx.fillText(wp.word, 0, 0);
              }

              ctx.restore();
            }
          }
        }

        // Apply transition alpha (crossfade = fade-in, fade-black = through black)
        if (segment && segment.transition && segment.transition !== "cut") {
          const transDur = segment.transitionDuration ?? 0.5;
          const transElapsed = time - segment.startTime;
          if (transDur > 0 && transElapsed < transDur) {
            const progress = transElapsed / transDur;
            const { inAlpha, blackAlpha } = getTransitionAlpha(segment.transition, progress);
            // Darken frame: crossfade uses (1 - inAlpha) overlay, fade-black uses blackAlpha
            const darkAmount = Math.max(1 - inAlpha, blackAlpha);
            if (darkAmount > 0.01) {
              ctx.save();
              ctx.globalAlpha = darkAmount;
              ctx.fillStyle = "#000000";
              ctx.fillRect(0, 0, WIDTH, HEIGHT);
              ctx.restore();
            }
          }
        }

        // Captions on top (all modes) — using captionConfig
        // Separate stanza from regular captions (must match CaptionOverlay logic)
        // Single-pass caption partitioning (avoids 3 separate filter calls per frame)
        const stanzaActiveCaptions: typeof phraseCaptions = [];
        const regularActiveCaptions: typeof phraseCaptions = [];
        for (const c of phraseCaptions) {
          if (time >= c.startTime && time < c.endTime) {
            if (c.stanzaId) stanzaActiveCaptions.push(c);
            else regularActiveCaptions.push(c);
          }
        }
        const isStanza = stanzaActiveCaptions.length >= 1;

        if (isStanza) {
          // Merge per-stanza style overrides (must match CaptionOverlay behavior)
          const activeStanzaId = stanzaActiveCaptions[0]?.stanzaId;
          const effStanza = activeStanzaId && stanzaStyleOverrides[activeStanzaId]
            ? { ...stanzaConfig, ...stanzaStyleOverrides[activeStanzaId] }
            : stanzaConfig;

          const normalSize = effStanza.normalFontSize;
          const effEmphFont = getCanvasFontName(effStanza.emphasisFontFamily);
          const effNormFont = getCanvasFontName(effStanza.normalFontFamily);
          const effLayout = effStanza.stanzaLayout;
          const effIsCascading = effLayout === "cascading";
          const effEmphSize = effIsCascading
            ? effStanza.emphasisFontSize * CASCADE_EMPH_SCALE
            : effStanza.emphasisFontSize;
          const effBaseY = effIsCascading
            ? HEIGHT * 0.90
            : effLayout === "inline"
              ? HEIGHT * 0.88
              : effLayout === "diagonal"
                ? HEIGHT * 0.92
                : effLayout === "scattered"
                  ? HEIGHT * 0.95
                  : captionConfig.position === "top"
                    ? HEIGHT * 0.15
                    : captionConfig.position === "center"
                      ? HEIGHT * 0.45
                      : HEIGHT * 0.85;
          const effBaseX = effIsCascading ? WIDTH * 0.06 : WIDTH / 2;

          const getStanzaUppercase = (cap: typeof stanzaActiveCaptions[0]) => {
            if (cap.styleOverride?.uppercase !== undefined) return cap.styleOverride.uppercase;
            return captionConfig.uppercase;
          };

          const drawStanzaWord = (cap: typeof stanzaActiveCaptions[0], x: number, y: number, alpha: number) => {
            const fSize = cap.isEmphasis ? effEmphSize : normalSize;
            const fontName = cap.isEmphasis ? effEmphFont : effNormFont;
            const weight = cap.isEmphasis ? "italic 700" : "400";
            ctx.font = `${weight} ${fSize}px ${fontName}, system-ui, sans-serif`;
            const displayText = getStanzaUppercase(cap) ? cap.text.toUpperCase() : cap.text;
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = cap.styleOverride?.color || "#FFFFFF";
            ctx.fillText(displayText, x, y);
            ctx.globalAlpha = 1;
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          };

          if (effLayout === "inline") {
            // Inline/Fluido: words side by side with word-wrap
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const lineY = effBaseY;
            let totalWidth = 0;
            const wordWidths: number[] = [];
            for (const cap of stanzaActiveCaptions) {
              const fSize = cap.isEmphasis ? effEmphSize : normalSize;
              const fontName = cap.isEmphasis ? effEmphFont : effNormFont;
              const weight = cap.isEmphasis ? "italic 700" : "400";
              ctx.font = `${weight} ${fSize}px ${fontName}, system-ui, sans-serif`;
              const displayText = getStanzaUppercase(cap) ? cap.text.toUpperCase() : cap.text;
              const w = ctx.measureText(displayText).width;
              wordWidths.push(w);
              totalWidth += w;
            }
            const gap = 16;
            totalWidth += gap * (stanzaActiveCaptions.length - 1);
            let curX = (WIDTH - totalWidth) / 2;
            for (let i = 0; i < stanzaActiveCaptions.length; i++) {
              const cap = stanzaActiveCaptions[i];
              const alpha = cap.isEmphasis ? 1 : 0.7;
              ctx.textAlign = "left";
              drawStanzaWord(cap, curX, lineY, alpha);
              curX += wordWidths[i] + gap;
            }
          } else if (effLayout === "diagonal") {
            // Diagonal: bottom-left to top-right (match CaptionOverlay container: bottom-[8%] height 35%)
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            const baseX = WIDTH * DIAGONAL_BASE_X;
            const baseBottomY = HEIGHT * DIAGONAL_BASE_BOTTOM_Y;
            const stepX = WIDTH * DIAGONAL_STEP_X;
            const stepY = HEIGHT * DIAGONAL_STEP_Y;
            for (let i = 0; i < stanzaActiveCaptions.length; i++) {
              const cap = stanzaActiveCaptions[i];
              const x = baseX + i * stepX;
              const y = baseBottomY - i * stepY;
              drawStanzaWord(cap, x, y, cap.isEmphasis ? 1 : 0.6);
            }
          } else if (effLayout === "scattered") {
            // Scattered: pseudo-random positions (match CaptionOverlay container: bottom-[5%] height 40%)
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let i = 0; i < stanzaActiveCaptions.length; i++) {
              const cap = stanzaActiveCaptions[i];
              const seed = i * 7 + (cap.text.charCodeAt(0) || 0);
              const x = scatteredRand(seed) * WIDTH * 0.7 + WIDTH * SCATTERED_X_OFFSET;
              const y = HEIGHT * (SCATTERED_Y_BASE - scatteredRand(seed + 1) * SCATTERED_Y_RANGE);
              drawStanzaWord(cap, x, y, cap.isEmphasis ? 1 : 0.55);
            }
          } else {
            // Centered / Cascading (original)
            ctx.textAlign = effIsCascading ? "left" : "center";
            ctx.textBaseline = "middle";

            const cascadeScale = WIDTH / REF_WIDTH;
            const cascadeIndentStep = CASCADE_INDENT_STEP * cascadeScale;
            const cascadeEmphNudge = CASCADE_EMPH_NUDGE * cascadeScale;
            const cascadeMaxIndent = CASCADE_MAX_INDENT * cascadeScale;
            const lines = stanzaActiveCaptions.map((cap, index) => {
              const size = cap.isEmphasis ? effEmphSize : normalSize;
              const emphPad = cap.isEmphasis && effIsCascading ? size * 0.15 : 0;
              const indent = effIsCascading
                ? Math.min(index * cascadeIndentStep + (cap.isEmphasis ? cascadeEmphNudge : 0), cascadeMaxIndent)
                : 0;
              return { caption: cap, fontSize: size, lineHeight: size * 1.2 + emphPad, indent };
            });
            const totalHeight = lines.reduce((sum, l) => sum + l.lineHeight, 0);
            let currentY = effBaseY - totalHeight / 2;

            for (const line of lines) {
              const { caption: cap } = line;
              const drawY = currentY + line.lineHeight / 2;
              const alpha = effIsCascading && !cap.isEmphasis ? 0.55 : 1;
              drawStanzaWord(cap, effBaseX + line.indent, drawY, alpha);
              currentY += line.lineHeight;
            }
          }
        } else if (regularActiveCaptions.length > 0) {
          const activeCaption = regularActiveCaptions[0];
          // Merge styleOverride for per-caption styling
          const eff = activeCaption.styleOverride ? { ...captionConfig, ...activeCaption.styleOverride } : captionConfig;
          const cFont = getCanvasFontName(eff.fontFamily);
          const cSize = eff.fontSize;
          ctx.font = `${eff.fontWeight} ${cSize}px ${cFont}, Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          // Apply letterSpacing if supported by the canvas context
          if (eff.letterSpacing && "letterSpacing" in ctx) {
            (ctx as unknown as Record<string, string>).letterSpacing = `${eff.letterSpacing}em`;
          }

          // Position (must match CaptionOverlay: top=15%, center=45%, bottom=85%)
          let captionY = HEIGHT * 0.85; // bottom
          if (eff.position === "top") captionY = HEIGHT * 0.15;
          else if (eff.position === "center") captionY = HEIGHT * 0.45;

          const displayText = eff.uppercase
            ? activeCaption.text.toUpperCase()
            : activeCaption.text;

          // Word-wrap long captions
          const maxTextWidth = WIDTH * 0.85;
          const lines = wrapText(ctx, displayText, maxTextWidth);
          const lineHeight = cSize * 1.25;
          const totalTextH = lines.length * lineHeight;
          const startY = captionY - totalTextH / 2 + lineHeight / 2;

          // Background box
          if (eff.backgroundEnabled) {
            const bgColor = eff.backgroundColor || "#000000";
            const bgOpacity = eff.backgroundOpacity ?? 0.6;
            const bgPadding = (eff.backgroundPadding ?? 8) * (WIDTH / REF_WIDTH);
            const bgRadius = (eff.backgroundBorderRadius ?? 4) * (WIDTH / REF_WIDTH);
            const r = parseInt(bgColor.slice(1, 3), 16);
            const g = parseInt(bgColor.slice(3, 5), 16);
            const b = parseInt(bgColor.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r},${g},${b},${bgOpacity})`;
            // Measure max line width for bg rect
            let maxLineW = 0;
            for (const line of lines) {
              const w = ctx.measureText(line).width;
              if (w > maxLineW) maxLineW = w;
            }
            const bgX = WIDTH / 2 - maxLineW / 2 - bgPadding;
            const bgY = startY - lineHeight / 2 - bgPadding * 0.5;
            const bgW = maxLineW + bgPadding * 2;
            const bgH = totalTextH + bgPadding;
            roundedRect(ctx, bgX, bgY, bgW, bgH, bgRadius);
            ctx.fill();
          }

          // Shadow
          if (eff.shadowBlur > 0) {
            ctx.shadowColor = eff.shadowColor;
            ctx.shadowBlur = eff.shadowBlur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
          }

          for (let li = 0; li < lines.length; li++) {
            const lineY = startY + li * lineHeight;
            // Stroke
            if (eff.strokeWidth > 0) {
              ctx.strokeStyle = eff.strokeColor;
              ctx.lineWidth = eff.strokeWidth * 2;
              ctx.lineJoin = "round";
              ctx.strokeText(lines[li], WIDTH / 2, lineY);
            }
            // Main text
            ctx.fillStyle = eff.color;
            ctx.fillText(lines[li], WIDTH / 2, lineY);
          }

          // Reset shadow and letterSpacing
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          if ("letterSpacing" in ctx) {
            (ctx as unknown as Record<string, string>).letterSpacing = "0px";
          }
        }
      } // end drawFrameContent

      // ── Choose export path ──
      let finalBlob: Blob;
      let finalExt: string;
      let finalMimeType: string;

      // Probe WebCodecs when HD quality is selected
      const webCodecsConfig: WebCodecsConfig | null = exportQuality === "hd"
        ? await probeWebCodecs(WIDTH, HEIGHT, FPS, videoBps)
        : null;

      if (webCodecsConfig) {
        // ═════════════════════════════════════════════════════════════
        // ══ WebCodecs Path (HD, offline frame-by-frame encoding) ════
        // ═════════════════════════════════════════════════════════════
        // Produces much higher quality than MediaRecorder because:
        // - latencyMode: "quality" (not real-time fast preset)
        // - bitrateMode: "variable" (VBR allocates more bits to complex frames)
        // - Exact frame timestamps (no drift or dropped frames)
        // Trade-off: ~2-4x slower than real-time (seek per frame)

        const bundle = createMuxerBundle(webCodecsConfig, WIDTH, HEIGHT, FPS);

        // 1. Encode all pre-mixed audio
        setStatus("exporting", "Codificando áudio...");
        await encodeAudio(bundle.audioEncoder, mixedAudio);

        if (signal.aborted) {
          try { bundle.videoEncoder.close(); bundle.audioEncoder.close(); } catch {}
          setStatus("ready", "Export cancelado");
          return;
        }

        // 2. Frame-by-frame: seek → draw → encode
        setStatus("exporting", "Renderizando HD...");
        const totalFrames = Math.ceil(videoDuration * FPS);

        for (let frame = 0; frame < totalFrames; frame++) {
          if (signal.aborted) break;

          const time = frame / FPS;

          // Seek presenter video to exact time
          await seekVideoToTime(video, time);

          // Seek active b-roll video if needed
          const seg = getCurrentMode(modeSegments, time);
          if (seg?.mode === "broll" && seg.brollMediaType !== "photo" && brollVideos[seg.id]) {
            const brollDur = brollVideos[seg.id].duration || 1;
            const brollTime = (time - seg.startTime) % brollDur;
            await seekVideoToTime(brollVideos[seg.id], brollTime);
          }

          // Draw frame content
          drawFrameContent(time);

          // Encode frame (with backpressure handling)
          await encodeVideoFrame(bundle.videoEncoder, canvas, frame, FPS);

          // Check for async encoder errors
          if (bundle.encoderError) {
            throw bundle.encoderError;
          }

          setProgress(Math.round(((frame + 1) / totalFrames) * 100));
        }

        if (signal.aborted) {
          try { bundle.videoEncoder.close(); bundle.audioEncoder.close(); } catch {}
          setStatus("ready", "Export cancelado");
          return;
        }

        // 3. Finalize
        setStatus("exporting", "Finalizando HD...");
        finalBlob = await finalizeMuxer(bundle);
        finalExt = "mp4";
        finalMimeType = "video/mp4";

      } else {
        // ═════════════════════════════════════════════════════════════
        // ══ MediaRecorder Path (Fast, real-time encoding) ═══════════
        // ═════════════════════════════════════════════════════════════

        // Set up audio playback for MediaRecorder
        const dest = audioCtx.createMediaStreamDestination();
        const playbackSrc = audioCtx.createBufferSource();
        playbackSrc.buffer = mixedAudio;
        playbackSrc.connect(dest);

        const canvasStream = canvas.captureStream(0);
        for (const track of dest.stream.getAudioTracks()) {
          canvasStream.addTrack(track);
        }

        // Codec priority: MP4 H.264+AAC → WebM VP9+Opus → VP8+Opus
        const mimeType = [
          "video/mp4;codecs=avc1.640028,mp4a.40.2",
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/mp4;codecs=avc1.640028",
          "video/mp4",
          "video/webm",
        ].find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

        const recorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: videoBps,
          audioBitsPerSecond: 128_000,
        });

        const chunks: Blob[] = [];
        recorder.addEventListener("dataavailable", (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        });

        const exportPromise = new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
        });

        recorder.addEventListener("error", (e) => {
          console.error("MediaRecorder error:", e);
        });

        // Play-based render loop (real-time, hardware-accelerated)
        recorder.start(1000);

        try {
          await video.play();
        } catch (e) {
          throw new Error(`Não foi possível reproduzir o vídeo para export: ${e instanceof Error ? e.message : e}`);
        }

        // Draw first frame with full compositing (captions, etc.)
        drawFrameContent(0);
        playbackSrc.start(0);

        // For captureStream(0), we need to request frames explicitly on non-Chrome browsers
        const captureTrack = canvasStream.getVideoTracks()[0];
        const needsRequestFrame = captureTrack && "requestFrame" in captureTrack;

        let activeBrollSegId: string | null = null;
        let renderStopped = false;
        let renderDone: (() => void) | null = null;
        const renderPromise = new Promise<void>((resolve) => { renderDone = resolve; });

        video.addEventListener("ended", () => { if (!renderStopped) stopRender(); }, { once: true });

        function stopRender() {
          if (renderStopped) return;
          renderStopped = true;
          video.pause();
          if (activeBrollSegId && brollVideos[activeBrollSegId]) {
            brollVideos[activeBrollSegId].pause();
          }
          renderDone?.();
        }

        const safetyTimer = setTimeout(stopRender, (videoDuration + 2) * 1000);

        function renderFrame() {
          if (renderStopped) return;

          if (signal.aborted) {
            clearTimeout(safetyTimer);
            stopRender();
            return;
          }

          const time = video.currentTime;
          if (time >= videoDuration - 0.01 || video.ended) {
            clearTimeout(safetyTimer);
            stopRender();
            return;
          }

          // Manage b-roll video playback
          const seg = getCurrentMode(modeSegments, time);
          const wantBrollId = (seg?.mode === "broll" && seg.brollMediaType !== "photo" && brollVideos[seg.id])
            ? seg.id : null;
          if (wantBrollId !== activeBrollSegId) {
            if (activeBrollSegId && brollVideos[activeBrollSegId]) brollVideos[activeBrollSegId].pause();
            if (wantBrollId) {
              const bv = brollVideos[wantBrollId];
              bv.currentTime = 0;
              bv.play().catch(() => {});
            }
            activeBrollSegId = wantBrollId;
          }

          // Draw frame
          drawFrameContent(time);

          // Signal captureStream to grab the new frame (required by Firefox/Safari with captureStream(0))
          if (needsRequestFrame) {
            (captureTrack as CanvasCaptureMediaStreamTrack).requestFrame();
          }

          setProgress(Math.round((time / videoDuration) * 100));

          if (!renderStopped) {
            requestAnimationFrame(renderFrame);
          }
        }

        requestAnimationFrame(renderFrame);
        await renderPromise;
        clearTimeout(safetyTimer);

        // Finalization
        setStatus("exporting", "Finalizando...");
        try { playbackSrc.stop(); } catch {}

        if (recorder.state === "recording") {
          try { recorder.requestData(); } catch {}
          recorder.stop();
        } else if (recorder.state === "paused") {
          recorder.resume();
          try { recorder.requestData(); } catch {}
          recorder.stop();
        }

        await Promise.race([
          exportPromise,
          new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
        ]);

        if (signal.aborted) {
          setStatus("ready", "Export cancelado");
          return;
        }

        const isMP4 = mimeType.includes("mp4");
        finalExt = isMP4 ? "mp4" : "webm";
        finalMimeType = isMP4 ? "video/mp4" : "video/webm";
        finalBlob = new Blob(chunks, { type: finalMimeType });
      }

      // ── Shared download logic ──
      if (finalBlob.size === 0) {
        throw new Error("Export gerou arquivo vazio");
      }

      const filename = `cineai-export.${finalExt}`;

      // Strategy 1 (mobile): navigator.share
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
        const file = new File([finalBlob], filename, { type: finalMimeType });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setStatus("ready", "Export concluído!");
            return;
          } catch (shareErr) {
            if ((shareErr as DOMException)?.name === "AbortError") {
              setStatus("ready", "Export concluído!");
              return;
            }
          }
        }
      }

      // Strategy 2 (desktop / fallback): anchor download
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        try { document.body.removeChild(a); } catch {}
        URL.revokeObjectURL(url);
      }, 3000);

      setStatus("ready", "Export concluído!");
    } catch (error) {
      console.error("Export error:", error);
      setStatus("ready", "Erro no export");
    } finally {
      try { audioCtx?.close(); } catch { /* already closed */ }
      abortRef.current = null;
      exportingRef.current = false;
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
    stanzaStyleOverrides,
    sfxConfig,
    sfxMarkers,
    voiceEnhanceConfig,
    exportResolution,
    exportQuality,
    customMusicTracks,
    setStatus,
  ]);

  return (
    <div className="p-4 space-y-6">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Exportar Vídeo
      </h3>

      {/* Resolution picker */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Resolução
        </label>
        <select
          value={exportResolution}
          onChange={(e) => setExportResolution(e.target.value as ResolutionKey)}
          disabled={exporting}
          className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {Object.entries(RESOLUTION_PRESETS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* Quality picker */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Qualidade
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setExportQuality("fast")}
            disabled={exporting}
            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              exportQuality === "fast"
                ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                : "bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-blue-500/30"
            }`}
          >
            Rápido
            <span className="block text-[10px] opacity-60 mt-0.5">Tempo real</span>
          </button>
          <button
            onClick={() => setExportQuality("hd")}
            disabled={exporting}
            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              exportQuality === "hd"
                ? "bg-purple-500/15 text-purple-400 border-purple-500/40"
                : "bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-purple-500/30"
            }`}
          >
            Alta Qualidade
            <span className="block text-[10px] opacity-60 mt-0.5">Mais lento</span>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Film className="w-4 h-4" />
          <span>{RESOLUTION_PRESETS[exportResolution]?.label || "1080×1920 (9:16)"}</span>
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
            {progress >= 100 ? "Finalizando..." : `Exportando... ${progress}%`}
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Exportar Vídeo
          </>
        )}
      </button>

      {/* Progress bar + Cancel */}
      {exporting && (
        <div className="space-y-2">
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={handleCancel}
            className="w-full py-2 rounded-xl text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

    </div>
  );
}
