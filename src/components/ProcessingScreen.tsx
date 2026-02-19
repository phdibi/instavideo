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
import { buildSegmentsFromTranscription, applyAllPresets } from "@/lib/presets";

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
// Strategy: Short, punchy captions (1-2 words) perfectly synced to speech.
// Inspired by Captions app: each caption shows only 1-2 words at a time,
// appearing EXACTLY when spoken for a professional "stop-scroll" effect.
function buildCaptionsFromTranscription(
  segments: TranscriptionSegment[],
  videoDuration: number
): Caption[] {
  const effectiveDuration =
    videoDuration > 0
      ? videoDuration
      : segments.length > 0
        ? segments[segments.length - 1].end + 0.5
        : 30;

  // Step 1: Collect all words with precise timestamps into a flat list
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
        wEnd = Math.max(wStart + 0.05, Math.min(wEnd, effectiveDuration));

        allWords.push({ word: w.word.trim(), start: wStart, end: wEnd });
      }
    } else {
      // Fallback: split segment text proportionally
      const segWords = seg.text.trim().split(/\s+/);
      const segDuration = seg.end - seg.start;
      for (let i = 0; i < segWords.length; i++) {
        const wStart = seg.start + (i / segWords.length) * segDuration;
        const wEnd = seg.start + ((i + 1) / segWords.length) * segDuration;
        if (segWords[i].trim().length > 0) {
          allWords.push({ word: segWords[i].trim(), start: wStart, end: wEnd });
        }
      }
    }
  }

  if (allWords.length === 0) return [];

  // Step 2: Group into SHORT captions (1-2 words) for punchy, scroll-stopping effect.
  // Rules:
  // - Max 2 words per caption (like Captions app)
  // - Single important/long words get their own caption
  // - Short filler words ("de", "a", "o", "e") pair with the NEXT word
  // - Natural pauses always trigger a new caption
  const MAX_WORDS = 2;
  const PAUSE_THRESHOLD = 0.25; // 250ms gap = new caption
  const SHORT_FILLERS = new Set([
    "a", "o", "e", "é", "de", "do", "da", "em", "no", "na",
    "um", "os", "as", "se", "ou", "que", "por", "ao", "dos",
    "das", "nos", "nas", "com", "sem", "mas", "nem",
    "the", "a", "an", "to", "of", "in", "on", "is", "it",
    "at", "or", "so", "as", "if", "be",
  ]);

  const rawCaptions: { words: string[]; start: number; end: number }[] = [];
  let i = 0;

  while (i < allWords.length) {
    const w = allWords[i];
    const wordLower = w.word.toLowerCase().replace(/[.,!?;:'"()]/g, "");

    // Check if this is a short filler word that should pair with the next
    const isShortFiller = SHORT_FILLERS.has(wordLower) || wordLower.length <= 2;
    const hasNextWord = i + 1 < allWords.length;
    const nextGap = hasNextWord ? allWords[i + 1].start - w.end : 999;
    const shouldPairForward = isShortFiller && hasNextWord && nextGap < PAUSE_THRESHOLD;

    if (shouldPairForward) {
      // Pair this filler with the next word
      const next = allWords[i + 1];
      rawCaptions.push({
        words: [w.word, next.word],
        start: w.start,
        end: next.end,
      });
      i += 2;
    } else if (!isShortFiller && hasNextWord && nextGap < PAUSE_THRESHOLD) {
      // Check if next word is a short filler that should pair with this one
      const next = allWords[i + 1];
      const nextLower = next.word.toLowerCase().replace(/[.,!?;:'"()]/g, "");
      const nextIsShortFiller = SHORT_FILLERS.has(nextLower) || nextLower.length <= 2;

      if (nextIsShortFiller) {
        // Pair this content word with the following filler
        rawCaptions.push({
          words: [w.word, next.word],
          start: w.start,
          end: next.end,
        });
        i += 2;
      } else {
        // Important word stands alone
        rawCaptions.push({
          words: [w.word],
          start: w.start,
          end: w.end,
        });
        i += 1;
      }
    } else {
      // Single word caption
      rawCaptions.push({
        words: [w.word],
        start: w.start,
        end: w.end,
      });
      i += 1;
    }
  }

  // Step 3: Build final caption objects with gapless timing
  // Each caption ends exactly when the next one starts — no dead frames
  const captions: Caption[] = [];

  for (let ci = 0; ci < rawCaptions.length; ci++) {
    const cap = rawCaptions[ci];
    const startTime = Math.max(0, cap.start);

    // End time: extend to the start of the NEXT caption, so there's no gap.
    // This keeps a caption visible until the next one replaces it.
    let endTime = cap.end;

    if (ci + 1 < rawCaptions.length) {
      const nextStart = rawCaptions[ci + 1].start;
      // If next caption starts within 0.4s, extend this one to fill the gap
      if (nextStart - endTime < 0.4) {
        endTime = nextStart;
      } else {
        // Big pause — add small buffer but don't fill the entire gap
        endTime = endTime + 0.08;
      }
    } else {
      // Last caption — small buffer
      endTime = endTime + 0.1;
    }

    endTime = Math.min(endTime, effectiveDuration);

    if (endTime > startTime + 0.05) {
      const text = cap.words.join(" ").toUpperCase(); // Uppercase for impact
      const emoji = getEmojiForCaption(cap.words.join(" "));

      captions.push({
        id: uuid(),
        startTime,
        endTime,
        text,
        style: { ...defaultCaptionStyle },
        animation: "pop",
        emphasis: [],
        emoji,
      });
    }
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

  // Step 2: Select top ~35% of segments for zooms (minimum 2, max based on count)
  const targetZoomCount = Math.max(2, Math.ceil(segments.length * 0.35));
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

    let params: Record<string, unknown>;
    switch (zoomType) {
      case "zoom-in":
        params = {
          scale: isHookZone ? 1.50 : isShortPunchy ? 1.30 : 1.20,
          focusX: 0.5,
          focusY: 0.30,
        };
        break;
      case "zoom-out":
        params = {
          scale: isHookZone ? 1.35 : 1.20,
        };
        break;
      case "zoom-pulse":
        params = {
          scale: isShortPunchy ? 1.18 : 1.12,
        };
        break;
      default:
        params = { scale: 1.15 };
    }

    effects.push({
      id: `effect_zoom_${index}`,
      type: zoomType,
      startTime: seg.start,
      endTime: seg.end,
      params,
    });
  }

  // Step 4: Add transition-fade at major pauses (improved detection)
  // Look for significant pauses > 0.6s to insert transitions
  for (let i = 0; i < segments.length - 1; i++) {
    const currentSeg = segments[i];
    const nextSeg = segments[i + 1];
    const gap = nextSeg.start - currentSeg.end;

    // Only add transition if there's a meaningful gap
    if (gap > 0.6) {
      effects.push({
        id: `effect_fade_${i}`,
        type: "transition-fade",
        startTime: currentSeg.end - 0.1, // Start slightly before end
        endTime: nextSeg.start + 0.1,    // End slightly after start
        params: { duration: Math.min(gap, 0.5) }, // Dynamic duration
      });
    }
  }

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

  // Add letterbox for cinematic feel in hook zone (first 3s)
  if (effectiveDuration > 4) {
    effects.push({
      id: "effect_letterbox_hook",
      type: "letterbox",
      startTime: 0,
      endTime: Math.min(3, effectiveDuration),
      params: { amount: 0.06 },
    });
  }

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

      // Step 1: Extract audio
      setStatus("extracting-audio");
      let audioBlob: Blob;

      // Load FFmpeg and reduce noise if possible
      try {
        const { FFmpegService } = await import("@/lib/ffmpeg");
        // We'll perform noise reduction directly on the extracted audio
        // First extract raw audio
        const rawAudio = await extractAudioFromVideo(videoFile);

        // Then reduce noise
        // Update status for UI feedback
        // Note: We might want to add a specific status for this, but for now reuse extraction or add a sub-step
        audioBlob = await FFmpegService.reduceNoise(rawAudio);
      } catch (err) {
        console.warn("Noise reduction failed or FFmpeg not loaded, using raw audio:", err);
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

      // Step 3: Build captions deterministically from transcription segments
      const captions = buildCaptionsFromTranscription(segments, effectiveDuration);

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

      // Try to enhance with AI preset detection
      try {
        const presetRes = await fetch("/api/segment-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription, videoDuration: effectiveDuration }),
        });

        if (presetRes.ok) {
          const presetData = await presetRes.json();
          const aiSegments = presetData.segments || [];

          for (let i = 0; i < videoSegments.length && i < aiSegments.length; i++) {
            const aiSeg = aiSegments.find((a: { index: number }) => a.index === i);
            if (aiSeg) {
              videoSegments[i].preset = aiSeg.preset as PresetType;
              videoSegments[i].keywordHighlight = aiSeg.keywordHighlight || videoSegments[i].keywordHighlight;
              videoSegments[i].brollQuery = aiSeg.brollQuery || videoSegments[i].brollQuery;
              videoSegments[i].confidence = aiSeg.confidence || 0.9;
            }
          }
        }
      } catch (err) {
        console.warn("AI preset detection failed, using heuristic presets:", err);
      }

      // Apply presets to captions and generate preset-specific effects
      const presetResult = applyAllPresets(videoSegments, captions, effectiveDuration);

      // Merge preset effects with AI/speech-driven effects
      const mergedEffects = [
        ...effects.filter(e => !e.id.startsWith("preset_")),
        ...presetResult.presetEffects,
      ].sort((a, b) => a.startTime - b.startTime);

      // Set state
      useProjectStore.getState().setSegments(videoSegments);
      setCaptions(presetResult.updatedCaptions);
      setEffects(mergedEffects);

      // Combine B-Roll from AI suggestions + preset-generated B-Roll
      const presetBrollItems = presetResult.presetBroll;
      const bRollItems = bRollSuggestions.map((s: BRollSuggestion) => ({
        id: s.id || uuid(),
        url: "",
        prompt: s.prompt,
        startTime: s.timestamp,
        endTime: s.timestamp + (s.duration || 2),
        animation: "fade" as const,
        opacity: 0.9,
        position: "fullscreen" as const,
      }));
      const allBRollItems = [...bRollItems, ...presetBrollItems];
      setBRollImages(allBRollItems);
      setEditPlan(editPlan as unknown as import("@/types").EditPlan);

      // Step 6: Auto-generate all B-roll images (AI + preset)
      const brollToGenerate = allBRollItems.filter(item => !item.url);
      if (brollToGenerate.length > 0) {
        setStatus("generating-broll");
        const batchSize = 3;
        for (let i = 0; i < brollToGenerate.length; i += batchSize) {
          const batch = brollToGenerate.slice(i, i + batchSize);
          await Promise.allSettled(
            batch.map(async (item) => {
              try {
                const brollRes = await fetch("/api/generate-broll", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt: item.prompt }),
                });
                if (brollRes.ok) {
                  const data = await brollRes.json();
                  if (data.imageUrl) {
                    updateBRollImage(item.id, { url: data.imageUrl });
                  }
                }
              } catch (err) {
                console.warn("B-roll generation failed for:", item.prompt, err);
              }
            })
          );
        }
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
