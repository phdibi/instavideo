"use client";

import { useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { extractAudioFromVideo } from "@/lib/audioExtractor";
import { v4 as uuid } from "uuid";
import type {
  Caption,
  CaptionStyle,
  EditEffect,
  BRollSuggestion,
  TranscriptionResult,
  TranscriptionSegment,
  EffectType,
  VideoSegment,
  PresetType,
} from "@/types";
import { buildSegmentsFromTranscription, applyAllPresets, forceThemeFromPillar, isAuthorityTheme, getAuthorityLean } from "@/lib/presets";

const defaultCaptionStyle: CaptionStyle = {
  fontFamily: "Inter",
  fontSize: 64,
  fontWeight: 900,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 3,
  shadowColor: "rgba(0,0,0,0.9)",
  shadowBlur: 8,
};

const steps = [
  { key: "extracting-audio", label: "Extraindo áudio do vídeo..." },
  { key: "transcribing", label: "Transcrevendo fala com IA..." },
  { key: "analyzing", label: "Analisando conteúdo e planejando edição..." },
  { key: "generating-plan", label: "Gerando efeitos cinematográficos..." },
  { key: "generating-broll", label: "Gerando imagens de B-roll com IA..." },
  { key: "ready", label: "Pronto!" },
];

// ===== Keyword → Emoji mapping for visual impact =====
// Maps common PT-BR and EN content words to relevant emojis.
// Only trigger on "important" words — not fillers, not every word.
const KEYWORD_EMOJI_MAP: Record<string, string> = {
  // Brain / Intelligence / Mind
  cérebro: "🧠", cerebro: "🧠", mente: "🧠", pensar: "🧠", pensamento: "🧠",
  inteligência: "🧠", inteligencia: "🧠", inteligente: "🧠",
  brain: "🧠", mind: "🧠", think: "🧠", thinking: "🧠", intelligence: "🧠", smart: "🧠",
  // Money / Business / Economy
  dinheiro: "💰", grana: "💰", lucro: "💰", receita: "💰", renda: "💰",
  faturamento: "💰", faturar: "💰", ganhar: "💰", ganhos: "💰",
  money: "💰", profit: "💰", revenue: "💰", income: "💰", cash: "💰",
  economizar: "💵", economia: "💵", economizando: "💵",
  save: "💵", saving: "💵", savings: "💵",
  investir: "📈", investimento: "📈", invest: "📈", investment: "📈",
  crescer: "📈", crescimento: "📈", growth: "📈", growing: "📈",
  negócio: "💼", negócios: "💼", empresa: "💼", business: "💼", company: "💼",
  // Technology
  máquina: "⚙️", maquina: "⚙️", machine: "⚙️", robô: "🤖", robo: "🤖", robot: "🤖",
  tecnologia: "🔧", technology: "🔧", tech: "🔧",
  inteligência_artificial: "🤖", ia: "🤖", ai: "🤖",
  código: "💻", codigo: "💻", programar: "💻", code: "💻", coding: "💻",
  app: "📱", aplicativo: "📱", celular: "📱", phone: "📱",
  // Fire / Energy / Power
  fogo: "🔥", quente: "🔥", fervendo: "🔥",
  fire: "🔥", hot: "🔥", lit: "🔥", bomb: "💣", bomba: "💣",
  energia: "⚡", poder: "⚡", poderoso: "⚡", potência: "⚡",
  energy: "⚡", power: "⚡", powerful: "⚡", force: "⚡",
  // Success / Victory
  sucesso: "🏆", vencer: "🏆", vitória: "🏆", campeão: "🏆",
  success: "🏆", win: "🏆", winner: "🏆", victory: "🏆", champion: "🏆",
  meta: "🎯", objetivo: "🎯", alvo: "🎯", foco: "🎯",
  goal: "🎯", target: "🎯", focus: "🎯",
  // Danger / Warning / Stop
  perigo: "⚠️", cuidado: "⚠️", atenção: "⚠️", atencao: "⚠️",
  danger: "⚠️", warning: "⚠️", attention: "⚠️", stop: "🛑",
  erro: "❌", errado: "❌", error: "❌", wrong: "❌", mistake: "❌",
  // Love / Heart / Emotion
  amor: "❤️", amar: "❤️", coração: "❤️", love: "❤️", heart: "❤️",
  // World / Global
  mundo: "🌍", mundial: "🌍", global: "🌍", world: "🌍", planeta: "🌍", planet: "🌍",
  // Time
  tempo: "⏰", hora: "⏰", relógio: "⏰", time: "⏰", clock: "⏰",
  rápido: "⚡", rapido: "⚡", fast: "⚡", quick: "⚡", speed: "⚡",
  // People / Social
  pessoa: "👤", pessoas: "👥", gente: "👥", people: "👥", team: "👥", equipe: "👥",
  família: "👨‍👩‍👧‍👦", familia: "👨‍👩‍👧‍👦", family: "👨‍👩‍👧‍👦",
  // Food
  comida: "🍽️", comer: "🍽️", food: "🍽️", eat: "🍽️",
  café: "☕", coffee: "☕",
  // Numbers / Stats
  milhão: "💎", milhões: "💎", bilhão: "💎", million: "💎", billion: "💎",
  // Music / Sound
  música: "🎵", musica: "🎵", music: "🎵", som: "🎵", sound: "🎵",
  // Education
  aprender: "📚", estudar: "📚", estudo: "📚", learn: "📚", study: "📚", education: "📚",
  segredo: "🔑", secret: "🔑", chave: "🔑", key: "🔑",
  ideia: "💡", idea: "💡", insight: "💡", inspiração: "💡",
  // Marketing / Viral
  viral: "🚀", lançar: "🚀", lançamento: "🚀", launch: "🚀", rocket: "🚀",
  estratégia: "♟️", estrategia: "♟️", strategy: "♟️",
  marca: "🏷️", brand: "🏷️", marketing: "📣",
  // Nature
  sol: "☀️", sun: "☀️", água: "💧", water: "💧",
  // Emotion intensifiers
  incrível: "🤯", incrivel: "🤯", absurdo: "🤯", impressionante: "🤯",
  incredible: "🤯", amazing: "🤯", insane: "🤯", mind_blowing: "🤯",
  // Health / Body
  saúde: "💪", saude: "💪", treino: "💪", exercício: "💪",
  health: "💪", workout: "💪", exercise: "💪", gym: "💪", fitness: "💪",
};

// Look up emoji for a caption's text. Returns emoji string or undefined.
function getEmojiForCaption(text: string): string | undefined {
  // Normalize: lowercase, remove punctuation
  const normalized = text.toLowerCase().replace(/[.,!?;:'"()]/g, "").trim();
  const words = normalized.split(/\s+/);

  // Check each word in the caption against the map
  for (const word of words) {
    if (KEYWORD_EMOJI_MAP[word]) {
      return KEYWORD_EMOJI_MAP[word];
    }
  }

  // Check multi-word phrases (join words and try)
  const joined = words.join("_");
  if (KEYWORD_EMOJI_MAP[joined]) {
    return KEYWORD_EMOJI_MAP[joined];
  }

  return undefined;
}

// ===== Deterministic caption builder using word-level timestamps =====
// Strategy: Groups of 3-5 words with real karaoke highlighting.
// Each word lights up exactly when spoken. Cards stay visible until the
// next card replaces them — ZERO empty frames throughout the video.
function buildCaptionsFromTranscription(
  segments: TranscriptionSegment[],
  videoDuration: number,
  options?: { authorityMode?: boolean }
): Caption[] {
  const authorityMode = options?.authorityMode ?? false;
  const effectiveDuration =
    videoDuration > 0
      ? videoDuration
      : segments.length > 0
        ? segments[segments.length - 1].end + 0.5
        : 30;

  // ── Step 1: Flatten all words with precise timestamps ──
  const allWords: { word: string; start: number; end: number }[] = [];

  for (const seg of segments) {
    if (!seg.text || seg.text.trim().length === 0) continue;

    if (seg.words && seg.words.length > 0) {
      const segStart = seg.start;
      const segEnd = seg.end;
      const segDuration = segEnd - segStart;
      const wordCount = seg.words.length;

      for (let wi = 0; wi < wordCount; wi++) {
        const w = seg.words[wi];
        if (!w.word || w.word.trim().length === 0) continue;

        let wStart = w.start;
        let wEnd = w.end;

        // Only redistribute if timestamps are completely broken
        if (wEnd <= wStart || wStart < 0 || wStart > effectiveDuration || wEnd < 0) {
          wStart = segStart + (wi / wordCount) * segDuration;
          wEnd = segStart + ((wi + 1) / wordCount) * segDuration;
        }

        wStart = Math.max(0, Math.min(wStart, effectiveDuration));
        // Min 20ms per word (was 50ms — 50ms compounds and creates progressive delay)
        wEnd = Math.max(wStart + 0.02, Math.min(wEnd, effectiveDuration));

        allWords.push({ word: w.word.trim(), start: wStart, end: wEnd });
      }
    } else {
      // Fallback: split segment text proportionally
      const segWords = seg.text.trim().split(/\s+/);
      const segDuration = seg.end - seg.start;
      for (let idx = 0; idx < segWords.length; idx++) {
        const wStart = seg.start + (idx / segWords.length) * segDuration;
        const wEnd = seg.start + ((idx + 1) / segWords.length) * segDuration;
        if (segWords[idx].trim().length > 0) {
          allWords.push({ word: segWords[idx].trim(), start: wStart, end: wEnd });
        }
      }
    }
  }

  if (allWords.length === 0) return [];

  // ── Step 2: Group words into caption cards ──
  // Captions-app style: sentence-level groups (6-10 words) displayed as a
  // horizontal word bar. The current word highlights in real-time (karaoke).
  // This gives viewers time to read ahead and feel perfectly in-sync.
  // Rules:
  //  • Pause > threshold between words ALWAYS triggers a new card
  //  • Never exceed MAX_WORDS per card
  //  • A trailing filler word won't start a new card alone — attach to previous
  const MAX_WORDS = 8; // Sentence-level: show 6-8 words at once
  const PAUSE_THRESHOLD = 0.5; // Only break on natural pauses (0.5s+)
  const SHORT_FILLERS = new Set([
    "a", "o", "e", "é", "de", "do", "da", "em", "no", "na",
    "um", "os", "as", "se", "ou", "que", "por", "ao", "dos",
    "das", "nos", "nas", "com", "sem", "mas", "nem",
    "the", "a", "an", "to", "of", "in", "on", "is", "it",
    "at", "or", "so", "as", "if", "be",
  ]);

  interface RawCaption {
    wordIndices: number[]; // indices into allWords
    start: number;
    end: number;
  }

  const rawCaptions: RawCaption[] = [];
  let current: RawCaption | null = null;

  for (let i = 0; i < allWords.length; i++) {
    const w = allWords[i];

    // Should we start a new card?
    let breakHere = false;
    if (!current) {
      breakHere = true;
    } else {
      const gap = w.start - current.end;
      if (gap >= PAUSE_THRESHOLD) breakHere = true;         // natural pause
      if (current.wordIndices.length >= MAX_WORDS) breakHere = true; // card full
    }

    // Avoid leaving a lone trailing filler as its own card — attach to previous
    if (breakHere && current && current.wordIndices.length < MAX_WORDS) {
      const wordLower = w.word.toLowerCase().replace(/[.,!?;:'"()]/g, "");
      const isFiller = SHORT_FILLERS.has(wordLower) || wordLower.length <= 2;
      const isLastWord = i === allWords.length - 1;
      const nextHasPause = !isLastWord && (allWords[i + 1].start - w.end) >= PAUSE_THRESHOLD;

      // Filler that would end up alone (last word or followed by a pause): attach to previous card
      if (isFiller && (isLastWord || nextHasPause)) {
        breakHere = false;
      }
    }

    if (breakHere) {
      if (current) rawCaptions.push(current);
      current = { wordIndices: [i], start: w.start, end: w.end };
    } else {
      current!.wordIndices.push(i);
      current!.end = w.end;
    }
  }
  if (current) rawCaptions.push(current);

  // ── Step 3: Build gapless Caption objects with per-word timings ──
  // Rule: EVERY caption extends EXACTLY to the start of the NEXT caption.
  // The LAST caption extends to effectiveDuration. ZERO empty frames.
  // CRITICAL: endTime NEVER exceeds the next caption's startTime — no overlaps.
  //
  // CAPTION ANTICIPATION: Professional subtitles appear slightly BEFORE the word
  // is spoken so the viewer has time to read. This is standard in broadcast/film.
  // 100ms anticipation feels perfectly in-sync to humans.
  const ANTICIPATION = 0.10; // seconds — shift captions earlier for perceptual sync
  const MIN_DURATION = 0.3; // minimum seconds any caption stays visible
  const captions: Caption[] = [];

  for (let ci = 0; ci < rawCaptions.length; ci++) {
    const cap = rawCaptions[ci];
    let startTime = Math.max(0, cap.start - ANTICIPATION);

    // Gapless: extend to start of next card, or to video end for the last card
    let endTime: number;
    if (ci + 1 < rawCaptions.length) {
      endTime = Math.max(0, rawCaptions[ci + 1].start - ANTICIPATION); // seamless handoff — no gap ever
    } else {
      endTime = effectiveDuration; // last card stays until video ends
    }

    // Enforce minimum duration WITHOUT creating overlap:
    // Pull startTime backwards (show caption earlier) instead of pushing
    // endTime forward (which would overlap with the next caption).
    if (endTime - startTime < MIN_DURATION) {
      startTime = Math.max(0, endTime - MIN_DURATION);
    }

    endTime = Math.min(endTime, effectiveDuration);
    if (endTime <= startTime + 0.02) continue; // skip degenerate

    // Build per-word timing array (for karaoke highlighting in the overlay)
    // Also apply anticipation to word timings for consistent sync
    const wordTimings: { start: number; end: number }[] = cap.wordIndices.map(
      (wi) => ({
        start: Math.max(0, allWords[wi].start - ANTICIPATION),
        end: Math.max(0.02, allWords[wi].end - ANTICIPATION),
      })
    );

    const wordTexts = cap.wordIndices.map((wi) => allWords[wi].word);
    const text = wordTexts.join(" ").toUpperCase();
    // Clean professional captions: no emojis (like Captions app)
    const emoji = undefined;

    captions.push({
      id: uuid(),
      startTime,
      endTime,
      text,
      style: { ...defaultCaptionStyle },
      animation: "karaoke",
      emphasis: [],
      emoji,
      wordTimings,
    });
  }

  return captions;
}

// ===== Speech-driven effect generator =====
// Selective zooms — only on key moments, not every segment.
// Professional approach: ~30-40% of segments get zooms.
// ===== Speech-driven effect generator =====
// Selective zooms — only on key moments, not every segment.
// Professional approach: ~30-40% of segments get zooms.
function buildSpeechDrivenEffects(
  segments: TranscriptionSegment[],
  videoDuration: number
): EditEffect[] {
  const effectiveDuration =
    videoDuration > 0
      ? videoDuration
      : segments.length > 0
        ? segments[segments.length - 1].end + 0.5
        : 30;

  const effects: EditEffect[] = [];

  // Step 1: Score each segment for zoom-worthiness
  const scoredSegments = segments.map((seg, i) => {
    let score = 0;
    const segDuration = seg.end - seg.start;
    const wordCount = seg.text.trim().split(/\s+/).length;

    // Hook zone (first 3s) — always zoom
    if (seg.start < 3) score += 10;

    // Short punchy phrases — high energy, worth zooming
    if (segDuration < 2 && wordCount <= 5) score += 5;

    // After a silence gap (> 0.5s) — topic shift, good for zoom
    if (i > 0) {
      const gap = seg.start - segments[i - 1].end;
      if (gap > 0.5) score += 4;
    }

    // Very long segments (> 4s) — probably not impactful
    if (segDuration > 4) score -= 2;

    // Segment too short to notice zoom
    if (segDuration < 0.3) score -= 10;

    return { seg, index: i, score, segDuration, wordCount };
  });

  // Step 2: Select top ~15% of segments for zooms — minimal, elegant
  const targetZoomCount = Math.max(1, Math.ceil(segments.length * 0.15));
  const zoomCandidates = scoredSegments
    .filter((s) => s.score > -5 && s.segDuration >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, targetZoomCount)
    .sort((a, b) => a.index - b.index); // Re-sort by timeline order

  // Step 3: Generate zoom effects only for selected segments
  const zoomPattern: EffectType[] = ["zoom-in", "zoom-out", "zoom-pulse"];

  for (let zi = 0; zi < zoomCandidates.length; zi++) {
    const { seg, index, segDuration, wordCount } = zoomCandidates[zi];
    const zoomType = zoomPattern[zi % zoomPattern.length];

    const isHookZone = seg.start < 3;
    const isShortPunchy = segDuration < 2 && wordCount <= 5;

    // Ultra-subtle zoom scales — barely perceptible, like Captions app
    let params: Record<string, unknown>;
    switch (zoomType) {
      case "zoom-in":
        params = {
          scale: isHookZone ? 1.08 : 1.05,
          focusX: 0.5,
          focusY: 0.38,
        };
        break;
      case "zoom-out":
        params = {
          scale: isHookZone ? 1.06 : 1.04,
        };
        break;
      case "zoom-pulse":
        params = {
          scale: 1.04,
        };
        break;
      default:
        params = { scale: 1.04 };
    }

    effects.push({
      id: `effect_zoom_${index}`,
      type: zoomType,
      startTime: seg.start,
      endTime: seg.end,
      params,
    });
  }

  // Extend the last zoom effect to cover the silent tail of the video.
  // When speech ends before the video does, the last zoom should hold
  // until videoDuration so the timeline doesn't look truncated.
  const zoomEffects = effects.filter(e => e.type.startsWith("zoom"));
  if (zoomEffects.length > 0 && effectiveDuration > 0) {
    const lastZoom = zoomEffects[zoomEffects.length - 1];
    if (lastZoom.endTime < effectiveDuration - 0.5) {
      lastZoom.endTime = effectiveDuration;
    }
  }

  // Step 4: NO auto-transitions — Captions app uses hard cuts exclusively.
  // Professional standard: clean hard cuts, no fades/wipes/etc.

  // Add cinematic color grade for full duration
  if (effectiveDuration > 0) {
    effects.push({
      id: "effect_colorgrade",
      type: "color-grade",
      startTime: 0,
      endTime: effectiveDuration,
      params: { preset: "cinematic-warm" },
    });
  }

  // Add subtle vignette for full duration
  if (effectiveDuration > 2) {
    effects.push({
      id: "effect_vignette",
      type: "vignette",
      startTime: 0,
      endTime: effectiveDuration,
      params: { intensity: 0.2 },
    });
  }

  // Letterbox removed — adds visual clutter without professional benefit.

  return effects;
}

export default function ProcessingScreen() {
  const {
    videoFile,
    videoDuration,
    status,
    setStatus,
    setCaptions,
    setEffects,
    setBRollImages,
    updateBRollImage,
    setEditPlan,
  } = useProjectStore();
  const processingRef = useRef(false);

  const processVideo = useCallback(async () => {
    if (!videoFile || processingRef.current) return;
    processingRef.current = true;

    try {
      // Step 0: Ensure we have a valid video duration
      // WebM recordings from teleprompter may have Infinity/0 duration initially
      if (!videoDuration || !isFinite(videoDuration) || videoDuration <= 0) {
        const resolvedDuration = await new Promise<number>((resolve) => {
          const tempVideo = document.createElement("video");
          tempVideo.preload = "auto";
          tempVideo.muted = true;

          const tryResolveDuration = () => {
            if (isFinite(tempVideo.duration) && tempVideo.duration > 0) {
              resolve(tempVideo.duration);
              tempVideo.src = "";
              return true;
            }
            return false;
          };

          tempVideo.onloadedmetadata = () => {
            if (!tryResolveDuration()) {
              // WebM fix: seek to a very large time to force duration calculation
              tempVideo.currentTime = Number.MAX_SAFE_INTEGER;
            }
          };

          tempVideo.ontimeupdate = () => {
            if (tryResolveDuration()) return;
            // If still not available, try seeking to end
            tempVideo.ontimeupdate = null;
          };

          tempVideo.ondurationchange = () => {
            tryResolveDuration();
          };

          // Fallback timeout — if we still can't determine duration after 5s, use 0 (will be estimated from segments)
          setTimeout(() => {
            if (!isFinite(tempVideo.duration) || tempVideo.duration <= 0) {
              resolve(0);
            }
            tempVideo.src = "";
          }, 5000);

          tempVideo.src = URL.createObjectURL(videoFile);
        });

        if (resolvedDuration > 0) {
          useProjectStore.getState().setVideoDuration(resolvedDuration);
        }
      }

      // Step 1: Extract audio using FFmpeg (preserves exact video timeline)
      // CRITICAL: We use FFmpeg instead of AudioContext because AudioContext
      // resamples to the system sample rate, which can shift timestamps and
      // cause progressive drift between captions and video.
      setStatus("extracting-audio");
      let audioBlob: Blob;
      let audioDurationFromWav = 0; // Physical WAV duration — used for calibration

      try {
        const { FFmpegService } = await import("@/lib/ffmpeg");
        // Single-pass: extract + clean (highpass filter only, no time-stretching)
        audioBlob = await FFmpegService.extractAndCleanAudio(videoFile);

        // PRECISE duration: decode with AudioContext instead of byte-math.
        // The old formula (size - 44) / 32000 assumed exactly 44-byte WAV headers,
        // but FFmpeg can produce headers of varying sizes (44, 46, 58+ bytes).
        // Even a few bytes off causes progressive drift over the entire video.
        try {
          const audioCtx = new AudioContext({ sampleRate: 16000 });
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          audioDurationFromWav = audioBuffer.duration;
          audioCtx.close();
          console.log(`[CineAI] Precise audio duration from AudioContext: ${audioDurationFromWav.toFixed(4)}s`);
        } catch {
          // Fallback to byte-math if AudioContext fails
          if (audioBlob.type === "audio/wav" || audioBlob.size > 44) {
            audioDurationFromWav = (audioBlob.size - 44) / 32000;
            console.log(`[CineAI] Fallback byte-math audio duration: ${audioDurationFromWav.toFixed(4)}s`);
          }
        }
      } catch (err) {
        console.warn("FFmpeg extraction failed, falling back to AudioContext:", err);
        try {
          audioBlob = await extractAudioFromVideo(videoFile);
        } catch {
          audioBlob = videoFile;
        }
      }

      // Step 2: Transcribe
      setStatus("transcribing");
      const formData = new FormData();
      formData.append(
        "audio",
        new File([audioBlob], "audio.wav", {
          type: audioBlob.type || "audio/wav",
        })
      );
      // Send precise audio duration so Gemini can anchor its timestamps
      if (audioDurationFromWav > 0) {
        formData.append("audioDuration", audioDurationFromWav.toFixed(3));
      }

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json();
        throw new Error(errData.error || "Transcription failed");
      }

      const transcription: TranscriptionResult = await transcribeRes.json();
      const segments = transcription.segments || [];

      // Use effective duration: read fresh from store (may have been resolved in Step 0)
      const currentVideoDuration = useProjectStore.getState().videoDuration;
      const effectiveDuration =
        currentVideoDuration > 0 && isFinite(currentVideoDuration)
          ? currentVideoDuration
          : segments.length > 0
            ? segments[segments.length - 1].end + 0.5
            : 30;

      // If we resolved duration from segments, update the store
      if ((!currentVideoDuration || !isFinite(currentVideoDuration) || currentVideoDuration <= 0) && effectiveDuration > 0) {
        useProjectStore.getState().setVideoDuration(effectiveDuration);
      }

      // Step 2b: Calibrate transcription timestamps to match video duration.
      //
      // LAYER 1: WAV-to-video correction.
      // The Gemini API timestamps are relative to the WAV audio we sent.
      // If FFmpeg resampling (-ar 16000) changed the audio duration even slightly,
      // ALL timestamps will be off by that ratio. This is the PRIMARY source of
      // drift and is corrected with a simple linear scale.
      if (audioDurationFromWav > 1 && effectiveDuration > 1) {
        const wavToVideoScale = effectiveDuration / audioDurationFromWav;
        const wavDriftPercent = Math.abs(1 - wavToVideoScale) * 100;

        console.log(
          `[CineAI] WAV duration=${audioDurationFromWav.toFixed(3)}s vs ` +
          `video=${effectiveDuration.toFixed(3)}s → scale=${wavToVideoScale.toFixed(6)} ` +
          `(${wavDriftPercent.toFixed(2)}% difference)`
        );

        // Apply if there's any meaningful difference (> 0.1%)
        if (wavDriftPercent > 0.1 && wavDriftPercent < 50) {
          for (const seg of segments) {
            seg.start *= wavToVideoScale;
            seg.end *= wavToVideoScale;
            if (seg.words) {
              for (const w of seg.words) {
                w.start *= wavToVideoScale;
                w.end *= wavToVideoScale;
              }
            }
          }
          console.log(`[CineAI] Applied WAV→video linear correction (${wavDriftPercent.toFixed(2)}%)`);
        }
      }

      // LAYER 2: Endpoint alignment — simple linear rescale if transcription
      // endpoint doesn't match video duration. This catches any residual drift
      // that Layer 1 didn't fix (e.g., Gemini timestamps ending before or after
      // the actual video end).
      //
      // With precise AudioContext duration in Layer 1, this layer should rarely
      // need to apply significant correction. Only a simple linear scale is used
      // (no quadratic/piecewise — those introduced mid-video distortion).
      if (segments.length > 1 && effectiveDuration > 0) {
        const lastTranscriptionTime = Math.max(
          ...segments.map(s => s.end),
          ...segments.flatMap(s => (s.words || []).map(w => w.end))
        );

        if (lastTranscriptionTime > effectiveDuration * 0.3) {
          const residualScale = effectiveDuration / lastTranscriptionTime;
          const residualDrift = Math.abs(1 - residualScale) * 100;

          console.log(
            `[CineAI] Residual drift after Layer 1: transcription=${lastTranscriptionTime.toFixed(2)}s, ` +
            `video=${effectiveDuration.toFixed(2)}s, residualScale=${residualScale.toFixed(4)} (${residualDrift.toFixed(1)}%)`
          );

          // Warn when drift is very high — Gemini may have significantly compressed timestamps
          if (residualDrift > 40) {
            console.warn(
              `[CineAI] HIGH DRIFT WARNING: Transcription timestamps drift ${residualDrift.toFixed(1)}% ` +
              `from video duration. Gemini may have compressed the timeline. ` +
              `Applying linear correction — review results for accuracy.`
            );
          }

          // Apply correction for drift up to 70% (Gemini can compress timestamps significantly)
          if (residualDrift > 0.5 && residualDrift < 70) {
            for (const seg of segments) {
              seg.start *= residualScale;
              seg.end *= residualScale;
              if (seg.words) {
                for (const w of seg.words) {
                  w.start *= residualScale;
                  w.end *= residualScale;
                }
              }
            }
            console.log(`[CineAI] Applied residual linear correction: ×${residualScale.toFixed(4)}`);
          }
        }
      }

      // LAYER 3: Piecewise progressive drift correction.
      // Gemini often produces timestamps that are accurate at the start but
      // drift progressively in the second half. A single linear scale can't
      // fix this — we need to apply different corrections to each half.
      //
      // Strategy: Find the midpoint segment, compare its timestamp position
      // against where it SHOULD be (proportional to video duration), and
      // apply separate linear scales to first-half and second-half.
      if (segments.length >= 4 && effectiveDuration > 5) {
        // Collect all word timestamps for midpoint analysis
        const allWordTimestamps: number[] = [];
        for (const seg of segments) {
          if (seg.words) {
            for (const w of seg.words) allWordTimestamps.push(w.start);
          } else {
            allWordTimestamps.push(seg.start);
          }
        }
        allWordTimestamps.sort((a, b) => a - b);

        if (allWordTimestamps.length >= 4) {
          const midIdx = Math.floor(allWordTimestamps.length / 2);
          const transcriptionMidTime = allWordTimestamps[midIdx];
          // Expected: midpoint should be at ~50% of video
          const expectedMidTime = effectiveDuration * 0.5;
          const midDriftRatio = transcriptionMidTime / expectedMidTime;
          const midDriftPercent = Math.abs(1 - midDriftRatio) * 100;

          console.log(
            `[CineAI] Layer 3 midpoint check: transcription mid=${transcriptionMidTime.toFixed(2)}s, ` +
            `expected=${expectedMidTime.toFixed(2)}s, ratio=${midDriftRatio.toFixed(4)} (${midDriftPercent.toFixed(1)}% off)`
          );

          // Only apply piecewise correction if midpoint is noticeably off (>3%)
          // and the drift suggests non-linear behavior
          if (midDriftPercent > 3 && midDriftPercent < 40) {
            const splitPoint = expectedMidTime;
            // Scale for first half: should map [0, transcriptionMidTime] → [0, expectedMidTime]
            const firstHalfScale = expectedMidTime / transcriptionMidTime;
            // Scale for second half: should map [transcriptionMidTime, end] → [expectedMidTime, effectiveDuration]
            const lastTime = Math.max(...segments.map(s => s.end), ...segments.flatMap(s => (s.words || []).map(w => w.end)));
            const secondHalfScale = (effectiveDuration - expectedMidTime) / (lastTime - transcriptionMidTime);

            console.log(
              `[CineAI] Applying piecewise correction: ` +
              `firstHalf ×${firstHalfScale.toFixed(4)}, secondHalf ×${secondHalfScale.toFixed(4)}`
            );

            const correctTime = (t: number): number => {
              if (t <= transcriptionMidTime) {
                return t * firstHalfScale;
              } else {
                return splitPoint + (t - transcriptionMidTime) * secondHalfScale;
              }
            };

            for (const seg of segments) {
              seg.start = Math.max(0, correctTime(seg.start));
              seg.end = Math.min(effectiveDuration, correctTime(seg.end));
              if (seg.words) {
                for (const w of seg.words) {
                  w.start = Math.max(0, correctTime(w.start));
                  w.end = Math.min(effectiveDuration, correctTime(w.end));
                }
              }
            }
            console.log(`[CineAI] Piecewise drift correction applied`);
          }
        }
      }

      // Step 3: Build captions deterministically from transcription segments
      // Read content pillar early to enable authority mode (fewer words, no emojis)
      const pillar = useProjectStore.getState().brandingConfig.contentPillar;
      const isAuthority = pillar !== "quick-tips" && pillar !== undefined;
      const captions = buildCaptionsFromTranscription(segments, effectiveDuration, { authorityMode: isAuthority });

      // Step 4: Get AI-generated effects and b-roll suggestions
      setStatus("analyzing");
      let aiEffects: EditEffect[] = [];
      let bRollSuggestions: BRollSuggestion[] = [];
      let editPlan: Record<string, unknown> = {};

      try {
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription, videoDuration: effectiveDuration }),
        });

        if (analyzeRes.ok) {
          editPlan = await analyzeRes.json();

          // Process AI effects - validate each one
          aiEffects = ((editPlan.effects as Partial<EditEffect>[]) || [])
            .map((e: Partial<EditEffect>) => ({
              id: e.id || uuid(),
              type: (e.type || "zoom-in") as EffectType,
              startTime: e.startTime || 0,
              endTime: e.endTime || 0,
              params: e.params || {},
            }))
            .filter(
              (e) =>
                e.endTime > e.startTime &&
                e.startTime >= 0 &&
                e.endTime <= effectiveDuration + 1
            );

          bRollSuggestions =
            (editPlan.bRollSuggestions as BRollSuggestion[]) || [];
        }
      } catch (err) {
        console.warn("AI analysis failed, using speech-driven effects:", err);
      }

      // Step 5: Build effects - prefer AI if good, otherwise speech-driven fallback
      // Lowered threshold: AI now generates ~35% zooms + globals, so fewer effects expected
      setStatus("generating-plan");
      const effects =
        aiEffects.length >= Math.max(3, segments.length * 0.2)
          ? aiEffects
          : buildSpeechDrivenEffects(segments, effectiveDuration);

      // Step 5b: Build semantic segments for AI presets
      const bRollTimings = bRollSuggestions.map(s => ({
        startTime: s.timestamp,
        endTime: s.timestamp + (s.duration || 2),
      }));
      const videoSegments = buildSegmentsFromTranscription(
        segments,
        effectiveDuration,
        bRollTimings
      );

      // Get branding config early for API calls and theme forcing
      const brandingConfig = useProjectStore.getState().brandingConfig;

      // Try to enhance with AI preset detection
      try {
        const presetRes = await fetch("/api/segment-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription, videoDuration: effectiveDuration, contentPillar: brandingConfig.contentPillar }),
        });

        if (presetRes.ok) {
          const presetData = await presetRes.json();
          const aiSegments = presetData.segments || [];

          for (let i = 0; i < videoSegments.length && i < aiSegments.length; i++) {
            const aiSeg = aiSegments.find((a: { index: number }) => a.index === i);
            if (aiSeg) {
              let preset = aiSeg.preset as PresetType;
              // Only the FIRST segment (index 0) can be "hook".
              if (preset === "hook" && i !== 0) {
                preset = "talking-head";
              }
              // NO force-conversion: respect the heuristic detection from detectPreset.
              // The simplified detectPreset already limits B-roll to every ~15-20 seconds.
              videoSegments[i].preset = preset;
              videoSegments[i].keywordHighlight = aiSeg.keywordHighlight || videoSegments[i].keywordHighlight;
              videoSegments[i].brollQuery = aiSeg.brollQuery || videoSegments[i].brollQuery;
              videoSegments[i].confidence = aiSeg.confidence || 0.9;
            }
          }
        }
      } catch (err) {
        console.warn("AI preset detection failed, using heuristic presets:", err);
      }

      // Force theme from content pillar if selected
      if (brandingConfig.contentPillar && brandingConfig.contentPillar !== "quick-tips") {
        forceThemeFromPillar(brandingConfig.contentPillar);
      }

      // Apply presets to captions and generate preset-specific effects
      const presetResult = applyAllPresets(videoSegments, captions, effectiveDuration);

      // Merge preset effects with AI/speech-driven effects
      // Remove AI effects that would conflict with preset effects (prevents double zooms)
      const nonPresetEffects = effects.filter(e => {
        if (e.id.startsWith("preset_")) return false;
        // Remove AI global color-grade/vignette (> 80% of duration) — presets replace them
        if ((e.type === "color-grade" || e.type === "vignette") &&
            e.endTime - e.startTime > effectiveDuration * 0.8) return false;
        // Remove AI/speech-driven zoom/pan/shake effects that overlap with preset-generated ones.
        // Presets already generate calibrated zooms per segment — AI zooms would stack and
        // create excessive, aggressive movement.
        if (e.type.startsWith("zoom") || e.type === "shake" || e.type.startsWith("pan")) {
          const hasPresetOverlap = presetResult.presetEffects.some(pe =>
            (pe.type.startsWith("zoom") || pe.type === "shake" || pe.type.startsWith("pan")) &&
            e.startTime < pe.endTime && e.endTime > pe.startTime
          );
          if (hasPresetOverlap) return false;
        }
        return true;
      });
      const mergedEffects = [
        ...nonPresetEffects,
        ...presetResult.presetEffects,
      ].sort((a, b) => a.startTime - b.startTime);

      // Set state
      useProjectStore.getState().setSegments(videoSegments);
      setCaptions(presetResult.updatedCaptions);
      setEffects(mergedEffects);

      // Combine B-Roll from AI suggestions + preset-generated B-Roll
      // Deduplicate: if an AI suggestion overlaps with a preset B-roll, drop the AI one
      const presetBrollItems = presetResult.presetBroll;
      const aiBRollItems = bRollSuggestions.map((s: BRollSuggestion) => ({
        id: s.id || uuid(),
        url: "",
        prompt: s.prompt,
        startTime: s.timestamp,
        endTime: s.timestamp + (s.duration || 2),
        animation: "fade" as const,
        opacity: 0.9,
        position: "fullscreen" as const,
      }));
      // Remove AI B-roll that overlaps with preset B-roll (preset is better positioned)
      const dedupedAiBroll = aiBRollItems.filter((ai) =>
        !presetBrollItems.some(
          (pb) => ai.startTime < pb.endTime && ai.endTime > pb.startTime
        )
      );
      const allBRollItems = [...dedupedAiBroll, ...presetBrollItems];
      setBRollImages(allBRollItems);
      setEditPlan(editPlan as unknown as import("@/types").EditPlan);

      // Step 6: Auto-generate all B-roll images (AI + preset)
      const brollToGenerate = allBRollItems.filter(item => !item.url);
      if (brollToGenerate.length > 0) {
        setStatus("generating-broll");
        const batchSize = 2; // Smaller batches for more reliable generation
        const MAX_RETRIES = 2;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < brollToGenerate.length; i += batchSize) {
          const batch = brollToGenerate.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map(async (item) => {
              const brollStyle = isAuthorityTheme()
                ? `authority-${getAuthorityLean()}`
                : undefined;

              for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                  const brollRes = await fetch("/api/generate-broll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: item.prompt, style: brollStyle }),
                  });

                  if (brollRes.ok) {
                    const data = await brollRes.json();
                    if (data.imageUrl) {
                      updateBRollImage(item.id, { url: data.imageUrl });
                      return true;
                    }
                  }

                  const errorData = await brollRes.json().catch(() => ({ error: `HTTP ${brollRes.status}` }));
                  console.warn(
                    `[CineAI] B-roll generation attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for "${item.prompt.slice(0, 50)}...":`,
                    errorData.error || `HTTP ${brollRes.status}`
                  );

                  // Wait before retry (exponential backoff)
                  if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                  }
                } catch (err) {
                  console.warn(
                    `[CineAI] B-roll generation network error (attempt ${attempt + 1}):`,
                    err instanceof Error ? err.message : err
                  );
                  if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                  }
                }
              }
              return false;
            })
          );

          for (const r of results) {
            if (r.status === "fulfilled" && r.value) successCount++;
            else failCount++;
          }
        }

        console.log(`[CineAI] B-roll generation complete: ${successCount} succeeded, ${failCount} failed out of ${brollToGenerate.length}`);
      }

      setStatus("ready");
    } catch (error) {
      console.error("Processing error:", error);
      setStatus(
        "error",
        error instanceof Error ? error.message : "Processing failed"
      );
    }
  }, [
    videoFile,
    videoDuration,
    setStatus,
    setCaptions,
    setEffects,
    setBRollImages,
    updateBRollImage,
    setEditPlan,
  ]);

  useEffect(() => {
    if (videoFile && status === "uploading") {
      processVideo();
    }
  }, [videoFile, status, processVideo]);

  const currentStepIdx = steps.findIndex((s) => s.key === status);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--accent)]/20 flex items-center justify-center mb-4 pulse-glow">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Processando seu vídeo</h2>
          <p className="text-[var(--text-secondary)]">
            A IA está analisando e criando sua edição cinematográfica
          </p>
        </div>

        <div className="space-y-4">
          {steps.map((step, i) => {
            const isComplete = i < currentStepIdx;
            const isCurrent = i === currentStepIdx;
            const isPending = i > currentStepIdx;

            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 p-4 rounded-xl transition-all duration-500 ${isCurrent
                  ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                  : isComplete
                    ? "bg-[var(--success)]/5 border border-[var(--success)]/20"
                    : "bg-[var(--surface)] border border-[var(--border)]"
                  }`}
              >
                {isComplete ? (
                  <CheckCircle className="w-5 h-5 text-[var(--success)] shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin shrink-0" />
                ) : (
                  <div
                    className={`w-5 h-5 rounded-full border-2 shrink-0 ${isPending
                      ? "border-[var(--border)]"
                      : "border-[var(--accent)]"
                      }`}
                  />
                )}
                <span
                  className={`text-sm ${isPending ? "text-[var(--text-secondary)]" : ""
                    } ${isCurrent ? "font-medium" : ""}`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {status === "error" && (
          <div className="mt-6 p-4 bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl">
            <p className="text-sm text-[var(--danger)]">
              Erro no processamento. Verifique sua API key e tente novamente.
            </p>
            <button
              onClick={() => {
                processingRef.current = false;
                setStatus("uploading");
              }}
              className="mt-3 px-4 py-2 bg-[var(--danger)] text-white rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
