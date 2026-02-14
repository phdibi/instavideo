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

// ===== Deterministic caption builder =====
function buildCaptionsFromTranscription(
  segments: { start: number; end: number; text: string }[],
  videoDuration: number
): Caption[] {
  const captions: Caption[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.text || seg.text.trim().length === 0) continue;

    const words = seg.text.trim().split(/\s+/);
    const segDuration = seg.end - seg.start;

    // Split into chunks of max 6 words for readable captions
    const maxWords = 6;
    const chunks: { text: string; startTime: number; endTime: number }[] = [];

    if (words.length <= maxWords) {
      chunks.push({
        text: seg.text.trim(),
        startTime: seg.start,
        endTime: seg.end,
      });
    } else {
      // Split into multiple chunks
      let wordIdx = 0;
      while (wordIdx < words.length) {
        const chunkWords = words.slice(wordIdx, wordIdx + maxWords);
        const chunkStart =
          seg.start + (wordIdx / words.length) * segDuration;
        const chunkEnd =
          seg.start +
          (Math.min(wordIdx + maxWords, words.length) / words.length) *
            segDuration;
        chunks.push({
          text: chunkWords.join(" "),
          startTime: chunkStart,
          endTime: chunkEnd,
        });
        wordIdx += maxWords;
      }
    }

    for (const chunk of chunks) {
      captions.push({
        id: uuid(),
        startTime: Math.max(0, chunk.startTime),
        endTime: Math.min(chunk.endTime, videoDuration),
        text: chunk.text,
        style: { ...defaultCaptionStyle },
        animation: "karaoke",
        emphasis: [],
      });
    }
  }

  // Sort and fix overlaps
  captions.sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < captions.length; i++) {
    if (captions[i].startTime < captions[i - 1].endTime) {
      captions[i - 1].endTime = captions[i].startTime;
    }
  }

  return captions.filter((c) => c.endTime - c.startTime > 0.05);
}

// ===== Fallback effect generator =====
function buildFallbackEffects(
  segments: { start: number; end: number; text: string }[],
  videoDuration: number
): EditEffect[] {
  const effects: EditEffect[] = [];
  const zoomTypes: EffectType[] = ["zoom-in", "zoom-out", "zoom-pulse"];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const zoomType = zoomTypes[i % zoomTypes.length];

    // One zoom per segment
    effects.push({
      id: `fb_effect_${i}`,
      type: zoomType,
      startTime: seg.start,
      endTime: seg.end,
      params:
        zoomType === "zoom-in"
          ? { scale: 1.2 + Math.random() * 0.15, focusX: 0.5, focusY: 0.35 }
          : zoomType === "zoom-out"
          ? { scale: 1.2 }
          : { scale: 1.12 },
    });
  }

  // Add a cinematic-warm color grade for the entire video
  if (videoDuration > 0) {
    effects.push({
      id: "fb_colorgrade",
      type: "color-grade",
      startTime: 0,
      endTime: videoDuration,
      params: { preset: "cinematic-warm" },
    });
  }

  // Add vignette for the full duration
  if (videoDuration > 3) {
    effects.push({
      id: "fb_vignette",
      type: "vignette",
      startTime: 0,
      endTime: videoDuration,
      params: { intensity: 0.25 },
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
      // Step 1: Extract audio
      setStatus("extracting-audio");
      let audioBlob: Blob;
      try {
        audioBlob = await extractAudioFromVideo(videoFile);
      } catch {
        audioBlob = videoFile;
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

      // Step 3: Build captions DETERMINISTICALLY from transcription
      // This is ALWAYS done, regardless of what the AI returns
      const captions = buildCaptionsFromTranscription(segments, videoDuration);

      // Step 4: Get AI-generated effects and b-roll suggestions
      setStatus("analyzing");
      let aiEffects: EditEffect[] = [];
      let bRollSuggestions: BRollSuggestion[] = [];
      let editPlan: Record<string, unknown> = {};

      try {
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription, videoDuration }),
        });

        if (analyzeRes.ok) {
          editPlan = await analyzeRes.json();

          // Process AI effects
          aiEffects = ((editPlan.effects as Partial<EditEffect>[]) || [])
            .map((e: Partial<EditEffect>) => ({
              id: e.id || uuid(),
              type: (e.type || "zoom-in") as EffectType,
              startTime: e.startTime || 0,
              endTime: e.endTime || 0,
              params: e.params || {},
            }))
            .filter((e) => e.endTime > e.startTime && e.endTime <= videoDuration + 1);

          bRollSuggestions =
            (editPlan.bRollSuggestions as BRollSuggestion[]) || [];
        }
      } catch (err) {
        console.warn("AI analysis failed, using fallback effects:", err);
      }

      // If AI didn't return useful effects, generate fallback
      setStatus("generating-plan");
      const effects =
        aiEffects.length >= 3
          ? aiEffects
          : buildFallbackEffects(segments, videoDuration);

      // Set state
      setCaptions(captions);
      setEffects(effects);

      const bRollItems = bRollSuggestions.map((s: BRollSuggestion) => ({
        id: s.id || uuid(),
        url: "",
        prompt: s.prompt,
        startTime: s.timestamp,
        endTime: s.timestamp + s.duration,
        animation: "fade" as const,
        opacity: 0.9,
        position: "fullscreen" as const,
      }));
      setBRollImages(bRollItems);
      setEditPlan(editPlan as unknown as import("@/types").EditPlan);

      // Step 5: Auto-generate all B-roll images
      if (bRollItems.length > 0) {
        setStatus("generating-broll");
        // Generate in parallel for speed (max 3 concurrent)
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
                className={`flex items-center gap-3 p-4 rounded-xl transition-all duration-500 ${
                  isCurrent
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
                    className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                      isPending
                        ? "border-[var(--border)]"
                        : "border-[var(--accent)]"
                    }`}
                  />
                )}
                <span
                  className={`text-sm ${
                    isPending ? "text-[var(--text-secondary)]" : ""
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
