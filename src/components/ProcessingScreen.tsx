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
} from "@/types";

const defaultCaptionStyle: CaptionStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: 800,
  color: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.6,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowColor: "rgba(0,0,0,0.5)",
  shadowBlur: 4,
};

const steps = [
  { key: "extracting-audio", label: "Extraindo áudio do vídeo..." },
  { key: "transcribing", label: "Transcrevendo fala com IA..." },
  { key: "analyzing", label: "Analisando conteúdo e planejando edição..." },
  { key: "generating-plan", label: "Gerando efeitos cinematográficos..." },
  { key: "generating-broll", label: "Gerando imagens de B-roll com IA..." },
  { key: "ready", label: "Pronto!" },
];

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
        // Fallback: send the video file directly for transcription
        audioBlob = videoFile;
      }

      // Step 2: Transcribe
      setStatus("transcribing");
      const formData = new FormData();
      formData.append(
        "audio",
        new File([audioBlob], "audio.wav", { type: audioBlob.type || "audio/wav" })
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

      // Step 3: Analyze and generate edit plan
      setStatus("analyzing");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription,
          videoDuration,
        }),
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || "Analysis failed");
      }

      setStatus("generating-plan");
      const editPlan = await analyzeRes.json();

      // Process captions from the edit plan
      let captions: Caption[] = (editPlan.captions || []).map(
        (c: Partial<Caption>) => ({
          id: c.id || uuid(),
          startTime: c.startTime || 0,
          endTime: c.endTime || 0,
          text: c.text || "",
          style: { ...defaultCaptionStyle, ...c.style },
          animation: c.animation || "pop",
          emphasis: c.emphasis || [],
        })
      );

      // Fallback: if captions are empty, create from transcription segments
      const segments = transcription.segments || [];
      if (captions.length === 0 && segments.length > 0) {
        captions = segments.flatMap(
          (seg: { start: number; end: number; text: string }, i: number) => {
            const words = seg.text.split(" ");
            // Split long segments into smaller captions (max 6-8 words)
            if (words.length > 8) {
              const mid = Math.ceil(words.length / 2);
              const midTime = seg.start + (seg.end - seg.start) * (mid / words.length);
              return [
                {
                  id: `cap_fb_${i}_a`,
                  startTime: seg.start,
                  endTime: midTime,
                  text: words.slice(0, mid).join(" "),
                  style: { ...defaultCaptionStyle },
                  animation: "karaoke" as const,
                  emphasis: [],
                },
                {
                  id: `cap_fb_${i}_b`,
                  startTime: midTime,
                  endTime: seg.end,
                  text: words.slice(mid).join(" "),
                  style: { ...defaultCaptionStyle },
                  animation: "karaoke" as const,
                  emphasis: [],
                },
              ];
            }
            return [{
              id: `cap_fb_${i}`,
              startTime: seg.start,
              endTime: seg.end,
              text: seg.text,
              style: { ...defaultCaptionStyle },
              animation: "karaoke" as const,
              emphasis: [],
            }];
          }
        );
      }

      // Validate and fix caption timing: clamp to video duration
      captions = captions
        .filter((c) => c.text && c.text.trim().length > 0)
        .map((c) => ({
          ...c,
          startTime: Math.max(0, Math.min(c.startTime, videoDuration)),
          endTime: Math.max(c.startTime + 0.1, Math.min(c.endTime, videoDuration)),
        }))
        .sort((a, b) => a.startTime - b.startTime);

      // CRITICAL: Remove overlaps - ensure no two captions overlap in time
      for (let i = 1; i < captions.length; i++) {
        if (captions[i].startTime < captions[i - 1].endTime) {
          // Shrink previous caption's end to match current's start
          captions[i - 1] = {
            ...captions[i - 1],
            endTime: captions[i].startTime,
          };
        }
      }
      // Remove any captions that became zero-duration after fixing overlaps
      captions = captions.filter((c) => c.endTime - c.startTime > 0.05);

      // Process effects
      const effects: EditEffect[] = (editPlan.effects || []).map(
        (e: Partial<EditEffect>) => ({
          id: e.id || uuid(),
          type: e.type || "zoom-in",
          startTime: e.startTime || 0,
          endTime: e.endTime || 0,
          params: e.params || {},
        })
      );

      // Process B-roll suggestions (store as placeholders, generate images on demand)
      const bRollSuggestions: BRollSuggestion[] =
        editPlan.bRollSuggestions || [];

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
      setEditPlan(editPlan);

      // Step 5: Auto-generate all B-roll images
      if (bRollItems.length > 0) {
        setStatus("generating-broll");
        for (const item of bRollItems) {
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
            // Continue with next b-roll, don't block the pipeline
          }
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
