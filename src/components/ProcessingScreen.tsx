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
} from "@/types";

const defaultCaptionStyle: CaptionStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: 800,
  color: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.5,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowColor: "rgba(0,0,0,0.8)",
  shadowBlur: 6,
};

const steps = [
  { key: "extracting-audio", label: "Extraindo áudio do vídeo..." },
  { key: "transcribing", label: "Transcrevendo fala com IA..." },
  { key: "analyzing", label: "Analisando conteúdo e planejando edição..." },
  { key: "generating-plan", label: "Gerando efeitos cinematográficos..." },
  { key: "generating-broll", label: "Gerando imagens de B-roll com IA..." },
  { key: "ready", label: "Pronto!" },
];

// ===== Deterministic caption builder using word-level timestamps =====
// Strategy: Collect ALL words with timestamps, validate/correct timing, then group into gapless captions
// Updated for better sync: reduced look-ahead, stricter gap handling, and smarter chunking
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
      // Validate word timestamps against segment boundaries
      const segStart = seg.start;
      const segEnd = seg.end;
      const segDuration = segEnd - segStart;
      const wordCount = seg.words.length;

      for (let wi = 0; wi < wordCount; wi++) {
        const w = seg.words[wi];
        if (!w.word || w.word.trim().length === 0) continue;

        let wStart = w.start;
        let wEnd = w.end;

        // Fix: word timestamps outside segment boundaries — redistribute proportionally
        // BUT prioritize original timestamps if they seem plausible
        if (wStart < segStart - 0.2 || wEnd > segEnd + 0.5 || wEnd <= wStart || wStart < 0) {
          // Only force redistribution if drastically wrong
          wStart = segStart + (wi / wordCount) * segDuration;
          wEnd = segStart + ((wi + 1) / wordCount) * segDuration;
        }

        // Ensure monotonic ordering with previous word, but allow small gaps (breaths)
        if (allWords.length > 0) {
          const prev = allWords[allWords.length - 1];
          if (wStart < prev.end - 0.05) { // Allow tiny 50ms overlap for cross-fades
            // Overlap detected — push start to end of previous
            const shift = prev.end - wStart;
            wStart = prev.end;
            wEnd = Math.max(wEnd + shift, wStart + 0.1);
          }
        }

        // Clamp to video duration
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

  // Step 2: Group words into caption chunks (3-6 words each)
  // Improved grouping: respects sentence endings and natural pauses more strictly
  const MAX_WORDS = 6; // Increased slightly for better flow
  const MIN_WORDS = 1; // Allow single words if emphatic
  const PAUSE_THRESHOLD = 0.4; // >0.4s gap triggers new caption

  const rawCaptions: { words: string[]; start: number; end: number }[] = [];
  let currentChunk: { words: string[]; start: number; end: number } = {
    words: [allWords[0].word],
    start: allWords[0].start,
    end: allWords[0].end,
  };

  for (let i = 1; i < allWords.length; i++) {
    const w = allWords[i];
    const prevW = allWords[i - 1];
    const gap = w.start - currentChunk.end;

    // Check for sentence ending punctuation in previous word
    const isSentenceEnd = /[.!?]$/.test(prevW.word);

    const chunkFull = currentChunk.words.length >= MAX_WORDS;
    const naturalPause = gap > PAUSE_THRESHOLD;

    if (chunkFull || naturalPause || isSentenceEnd) {
      // Finish current chunk and start a new one
      rawCaptions.push({ ...currentChunk });
      currentChunk = { words: [w.word], start: w.start, end: w.end };
    } else {
      // Add word to current chunk
      currentChunk.words.push(w.word);
      currentChunk.end = w.end;
    }
  }
  // Don't forget the last chunk
  rawCaptions.push({ ...currentChunk });

  // Step 3: Merge extremely short captions with next IF no pause
  const mergedCaptions: typeof rawCaptions = [];
  for (let i = 0; i < rawCaptions.length; i++) {
    const cap = rawCaptions[i];

    // Check if next caption exists and gap is small
    const nextCap = i + 1 < rawCaptions.length ? rawCaptions[i + 1] : null;
    const gapToNext = nextCap ? nextCap.start - cap.end : Infinity;

    if (
      cap.words.length < 2 &&
      nextCap &&
      gapToNext < 0.2 &&
      !/[.!?]$/.test(cap.words[0]) // Don't merge if it's a sentence end
    ) {
      // Merge with next
      rawCaptions[i + 1] = {
        words: [...cap.words, ...nextCap.words],
        start: cap.start,
        end: nextCap.end,
      };
    } else {
      mergedCaptions.push(cap);
    }
  }

  // Step 4: Build final caption objects with improved timing offsets
  // REDUCED ANTICIPATION: From 0.1s to 0.05s to feel "snappier"
  const ANTICIPATION_OFFSET = 0.05;
  const READABILITY_BUFFER = 0.2;
  const captions: Caption[] = [];

  for (let i = 0; i < mergedCaptions.length; i++) {
    const cap = mergedCaptions[i];
    const startTime = Math.max(0, cap.start - ANTICIPATION_OFFSET);

    // End time logic: precise end of last word + buffer
    let endTime = cap.end + READABILITY_BUFFER;

    // Ensure we don't overlap with the next caption's start time
    if (i + 1 < mergedCaptions.length) {
      // If next caption starts strictly after this one ends, great.
      // If they overlap due to buffer, cut this one short.
      const nextStart = mergedCaptions[i + 1].start - ANTICIPATION_OFFSET;
      endTime = Math.min(endTime, nextStart);
    }

    // Clamp to video duration
    endTime = Math.min(endTime, effectiveDuration);

    if (endTime > startTime + 0.1) {
      captions.push({
        id: uuid(),
        startTime,
        endTime,
        text: cap.words.join(" "),
        style: { ...defaultCaptionStyle },
        animation: "karaoke",
        emphasis: [],
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
          scale: isHookZone ? 1.30 : isShortPunchy ? 1.20 : 1.12,
          focusX: 0.5,
          focusY: 0.35,
        };
        break;
      case "zoom-out":
        params = {
          scale: isHookZone ? 1.20 : 1.12,
        };
        break;
      case "zoom-pulse":
        params = {
          scale: isShortPunchy ? 1.10 : 1.06,
        };
        break;
      default:
        params = { scale: 1.10 };
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

      // Set state
      setCaptions(captions);
      setEffects(effects);

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
      setBRollImages(bRollItems);
      setEditPlan(editPlan as unknown as import("@/types").EditPlan);

      // Step 6: Auto-generate all B-roll images
      if (bRollItems.length > 0) {
        setStatus("generating-broll");
        const batchSize = 3;
        for (let i = 0; i < bRollItems.length; i += batchSize) {
          const batch = bRollItems.slice(i, i + batchSize);
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
