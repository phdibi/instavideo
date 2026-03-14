"use client";

import { useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { FFmpegService } from "@/lib/ffmpeg";
import { generatePhraseCaptions } from "@/lib/modes";
import type { TranscriptionResult, ModeSegment, PexelsVideoResult, PexelsPhotoResult } from "@/types";

const steps = [
  { key: "uploading", label: "Preparando vídeo..." },
  { key: "extracting-audio", label: "Extraindo áudio..." },
  { key: "transcribing", label: "Transcrevendo áudio..." },
  { key: "analyzing-modes", label: "Analisando conteúdo..." },
  { key: "fetching-broll", label: "Buscando b-rolls..." },
  { key: "building-video", label: "Montando seu vídeo..." },
  { key: "ready", label: "Pronto!" },
];

export default function ProcessingScreen() {
  const {
    videoFile,
    status,
    statusMessage,
    setStatus,
    setModeSegments,
    setPhraseCaptions,
  } = useProjectStore();

  const hasStarted = useRef(false);

  const runPipeline = useCallback(async () => {
    if (!videoFile) {
      console.error("ProcessingScreen: videoFile is null, cannot start pipeline");
      setStatus("error", "Nenhum vídeo encontrado. Tente novamente.");
      return;
    }

    try {
      // Step 1: Extract audio using FFmpeg WASM (works on all browsers including iOS Safari)
      setStatus("extracting-audio", "Extraindo áudio do vídeo...");
      let audioBlob: Blob;
      try {
        audioBlob = await FFmpegService.extractAndCleanAudio(videoFile);
      } catch (audioErr) {
        console.error("Audio extraction failed:", audioErr);
        throw new Error("Falha ao extrair áudio do vídeo. Verifique o formato do arquivo.");
      }

      // Step 2: Transcribe with Whisper
      setStatus("transcribing", "Transcrevendo áudio...");
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.wav");

      const transcribeRes = await fetch("/api/transcribe-whisper", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) {
        const errorData = await transcribeRes.json().catch(() => ({}));
        console.error("Whisper API error:", transcribeRes.status, errorData);
        throw new Error(
          (errorData as { error?: string }).error || `Transcrição falhou (HTTP ${transcribeRes.status})`
        );
      }

      const transcription: TranscriptionResult = await transcribeRes.json();

      if (!transcription.segments || transcription.segments.length === 0) {
        throw new Error("Nenhuma fala detectada no vídeo. Verifique se o vídeo tem áudio.");
      }

      // Step 3: Analyze modes with Claude
      // Read videoDuration from store at this point (not from closure) to avoid stale value
      const currentDuration = useProjectStore.getState().videoDuration;
      setStatus("analyzing-modes", "Analisando conteúdo...");

      const transcriptionText = transcription.segments
        .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
        .join("\n");

      const analyzeRes = await fetch("/api/analyze-modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription: transcriptionText,
          duration: currentDuration || 60, // fallback to 60s if duration unknown
        }),
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json().catch(() => ({}));
        console.error("Analyze modes error:", analyzeRes.status, errorData);
        throw new Error(
          (errorData as { error?: string }).error || `Análise de modos falhou (HTTP ${analyzeRes.status})`
        );
      }

      const { segments: modeSegments }: { segments: ModeSegment[] } =
        await analyzeRes.json();

      if (!modeSegments || modeSegments.length === 0) {
        throw new Error("Nenhum segmento de modo foi gerado. Tente novamente.");
      }

      setModeSegments(modeSegments);

      // Step 4: Fetch b-roll videos for Mode B segments
      setStatus("fetching-broll", "Buscando b-rolls...");
      const brollSegments = modeSegments.filter(
        (s) => s.mode === "broll" && s.brollQuery
      );

      const updatedSegments = [...modeSegments];

      await Promise.all(
        brollSegments.map(async (seg) => {
          try {
            const res = await fetch(
              `/api/search-broll?query=${encodeURIComponent(seg.brollQuery!)}`
            );
            if (!res.ok) return;
            const data: { videos: PexelsVideoResult[]; photos: PexelsPhotoResult[] } =
              await res.json();
            const { videos, photos } = data;

            const idx = updatedSegments.findIndex((s) => s.id === seg.id);
            if (idx === -1) return;

            const segDuration = seg.endTime - seg.startTime;
            const preferPhoto = segDuration <= 3 && photos && photos.length > 0;

            if (preferPhoto) {
              // Short segments: prefer photo for more visible effect on static image
              updatedSegments[idx] = {
                ...updatedSegments[idx],
                brollImageUrl: `/api/proxy-video?url=${encodeURIComponent(photos[0].url)}`,
                brollMediaType: "photo",
                pexelsAlternatives: videos,
                pexelsPhotoAlternatives: photos,
              };
            } else if (videos.length > 0) {
              updatedSegments[idx] = {
                ...updatedSegments[idx],
                brollVideoUrl: `/api/proxy-video?url=${encodeURIComponent(videos[0].url)}`,
                brollMediaType: "video",
                pexelsAlternatives: videos,
                pexelsPhotoAlternatives: photos || [],
              };
            }
          } catch (e) {
            console.warn("B-roll fetch failed for:", seg.brollQuery, e);
          }
        })
      );

      // Set varied default b-roll effects and layouts for visual dynamism
      const brollEffectsRotation = [
        "zoom-in", "ken-burns", "pan-left", "zoom-out", "pan-right", "parallax",
      ] as const;
      const brollLayoutRotation = [
        "fullscreen", "split", "overlay", "fullscreen", "split", "overlay",
      ] as const;
      let brollIdx = 0;
      for (let i = 0; i < updatedSegments.length; i++) {
        if (updatedSegments[i].mode === "broll") {
          updatedSegments[i] = {
            ...updatedSegments[i],
            brollEffect: brollEffectsRotation[brollIdx % brollEffectsRotation.length],
            brollEffectIntensity: 1.0,
            brollLayout: brollLayoutRotation[brollIdx % brollLayoutRotation.length],
          };
          brollIdx++;
        }
      }

      setModeSegments(updatedSegments);

      // Step 5: Generate phrase captions
      setStatus("building-video", "Montando seu vídeo...");
      const phrases = generatePhraseCaptions(transcription);
      setPhraseCaptions(phrases);

      // Done
      setStatus("ready", "Pronto!");
    } catch (error) {
      console.error("Processing pipeline error:", error);
      setStatus(
        "error",
        error instanceof Error ? error.message : "Erro desconhecido no processamento"
      );
    }
  }, [videoFile, setStatus, setModeSegments, setPhraseCaptions]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runPipeline();
  }, [runPipeline]);

  const currentStepIdx = steps.findIndex((s) => s.key === status);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Processando vídeo</h2>
          <p className="text-sm text-zinc-400">
            Isso pode levar alguns instantes...
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => {
            const isActive = step.key === status;
            const isComplete = currentStepIdx > i || status === "ready";

            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? "bg-white/10 border border-white/20"
                    : isComplete
                      ? "bg-white/5 border border-white/5"
                      : "opacity-40"
                }`}
              >
                {isActive ? (
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                ) : isComplete ? (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-zinc-600 flex-shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    isActive
                      ? "text-white font-medium"
                      : isComplete
                        ? "text-zinc-400"
                        : "text-zinc-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {status === "error" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
            <p className="text-red-400 text-sm font-medium">
              Erro no processamento
            </p>
            {statusMessage && (
              <p className="text-red-400/80 text-xs">
                {statusMessage}
              </p>
            )}
            <button
              onClick={() => useProjectStore.getState().reset()}
              className="mt-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
