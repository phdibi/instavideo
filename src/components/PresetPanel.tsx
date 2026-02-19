"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Wand2,
  Zap,
  User,
  Image as ImageIcon,
  Cpu,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";
import {
  PRESET_INFO,
  buildSegmentsFromTranscription,
  applyAllPresets,
} from "@/lib/presets";
import type { PresetType, VideoSegment } from "@/types";
import { v4 as uuid } from "uuid";

const presetIcons: Record<PresetType, React.ReactNode> = {
  "hook": <Zap className="w-3.5 h-3.5" />,
  "talking-head": <User className="w-3.5 h-3.5" />,
  "talking-head-broll": <ImageIcon className="w-3.5 h-3.5" />,
  "futuristic-hud": <Cpu className="w-3.5 h-3.5" />,
};

const presetOptions: PresetType[] = [
  "hook",
  "talking-head",
  "talking-head-broll",
  "futuristic-hud",
];

export default function PresetPanel() {
  const {
    segments,
    setSegments,
    updateSegment,
    captions,
    setCaptions,
    effects,
    setEffects,
    bRollImages,
    setBRollImages,
    updateBRollImage,
    videoDuration,
    editPlan,
    setCurrentTime,
  } = useProjectStore();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Analyze segments with AI
  const analyzeWithAI = useCallback(async () => {
    setIsAnalyzing(true);
    setStatusMessage("Analisando segmentos com IA...");

    try {
      const transcription = editPlan
        ? { segments: segments.map(s => ({ start: s.startTime, end: s.endTime, text: s.text })) }
        : null;

      if (!transcription || transcription.segments.length === 0) {
        // Build from captions if no segments exist
        const captionSegments = captions.map(c => ({
          start: c.startTime,
          end: c.endTime,
          text: c.text,
        }));

        if (captionSegments.length === 0) {
          setStatusMessage("Nenhum conteúdo para analisar");
          setIsAnalyzing(false);
          return;
        }

        const res = await fetch("/api/segment-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcription: { segments: captionSegments },
            videoDuration,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const aiSegments = data.segments || [];

          const newSegments: VideoSegment[] = captionSegments.map((seg, i) => {
            const aiSeg = aiSegments.find((a: { index: number }) => a.index === i);
            return {
              id: uuid(),
              startTime: seg.start,
              endTime: seg.end,
              text: seg.text,
              preset: (aiSeg?.preset || "talking-head") as PresetType,
              keywordHighlight: aiSeg?.keywordHighlight || "",
              brollQuery: aiSeg?.brollQuery || "",
              confidence: aiSeg?.confidence || 0.8,
            };
          });

          setSegments(newSegments);
          setStatusMessage(`${newSegments.length} segmentos analisados com IA`);
        } else {
          throw new Error("AI analysis failed");
        }
      } else {
        const res = await fetch("/api/segment-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcription, videoDuration }),
        });

        if (res.ok) {
          const data = await res.json();
          const aiSegments = data.segments || [];

          const updatedSegments = segments.map((seg, i) => {
            const aiSeg = aiSegments.find((a: { index: number }) => a.index === i);
            if (aiSeg) {
              return {
                ...seg,
                preset: aiSeg.preset as PresetType,
                keywordHighlight: aiSeg.keywordHighlight || seg.keywordHighlight,
                brollQuery: aiSeg.brollQuery || seg.brollQuery,
                confidence: aiSeg.confidence || 0.9,
              };
            }
            return seg;
          });

          setSegments(updatedSegments);
          setStatusMessage(`${updatedSegments.length} segmentos analisados com IA`);
        } else {
          throw new Error("AI analysis failed");
        }
      }
    } catch (err) {
      console.warn("AI preset analysis failed, using heuristic:", err);
      // Fallback to heuristic
      runHeuristicAnalysis();
    }

    setIsAnalyzing(false);
  }, [segments, captions, editPlan, videoDuration, setSegments]);

  // Heuristic-only analysis (no API call)
  const runHeuristicAnalysis = useCallback(() => {
    const captionSegments = captions.map(c => ({
      start: c.startTime,
      end: c.endTime,
      text: c.text,
      confidence: 1,
      words: [],
    }));

    // Merge consecutive captions into larger segments (group by 0.5s gaps)
    const mergedSegments: { start: number; end: number; text: string }[] = [];
    let current: { start: number; end: number; text: string } | null = null;

    for (const cap of captionSegments) {
      if (!current) {
        current = { start: cap.start, end: cap.end, text: cap.text };
      } else if (cap.start - current.end < 0.5) {
        current.end = cap.end;
        current.text += " " + cap.text;
      } else {
        mergedSegments.push(current);
        current = { start: cap.start, end: cap.end, text: cap.text };
      }
    }
    if (current) mergedSegments.push(current);

    const brollTimings = bRollImages.map(b => ({
      startTime: b.startTime,
      endTime: b.endTime,
    }));

    const newSegments = buildSegmentsFromTranscription(
      mergedSegments.map(s => ({
        start: s.start,
        end: s.end,
        text: s.text,
        confidence: 1,
      })),
      videoDuration,
      brollTimings
    );

    setSegments(newSegments);
    setStatusMessage(`${newSegments.length} segmentos detectados (heurística)`);
  }, [captions, bRollImages, videoDuration, setSegments]);

  // Apply all presets to the video
  const applyPresets = useCallback(async () => {
    if (segments.length === 0) {
      setStatusMessage("Primeiro analise os segmentos");
      return;
    }

    setIsApplying(true);
    setStatusMessage("Aplicando presets...");

    // Remove previously applied preset effects and AI global color-grade/vignette
    const nonPresetEffects = effects.filter(e => {
      if (e.id.startsWith("preset_")) return false;
      // Remove AI global color-grade/vignette (> 80% of duration) — presets replace them
      if ((e.type === "color-grade" || e.type === "vignette") &&
          e.endTime - e.startTime > videoDuration * 0.8) return false;
      return true;
    });
    const nonPresetBroll = bRollImages.filter(
      b => !b.id.startsWith("preset_")
    );

    const result = applyAllPresets(segments, captions, videoDuration);

    // Merge effects: keep non-preset + add new preset effects
    const mergedEffects = [...nonPresetEffects, ...result.presetEffects].sort(
      (a, b) => a.startTime - b.startTime
    );

    // Merge B-Roll: keep existing non-preset + add new preset B-Roll
    const mergedBroll = [...nonPresetBroll, ...result.presetBroll];

    setCaptions(result.updatedCaptions);
    setEffects(mergedEffects);
    setBRollImages(mergedBroll);

    // Generate B-Roll images for new preset B-Roll items
    const newBrollItems = result.presetBroll.filter(b => !b.url);
    if (newBrollItems.length > 0) {
      setStatusMessage(`Gerando ${newBrollItems.length} B-Roll imagens...`);
      const batchSize = 3;
      for (let i = 0; i < newBrollItems.length; i += batchSize) {
        const batch = newBrollItems.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (item) => {
            try {
              const res = await fetch("/api/generate-broll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: item.prompt }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.imageUrl) {
                  updateBRollImage(item.id, { url: data.imageUrl });
                }
              }
            } catch (err) {
              console.warn("B-roll generation failed:", err);
            }
          })
        );
      }
    }

    setStatusMessage("Presets aplicados com sucesso!");
    setIsApplying(false);

    // Clear status after 3s
    setTimeout(() => setStatusMessage(""), 3000);
  }, [
    segments, captions, effects, bRollImages, videoDuration,
    setCaptions, setEffects, setBRollImages, updateBRollImage,
  ]);

  // Build segments from captions on first load if none exist
  useEffect(() => {
    if (segments.length === 0 && captions.length > 0) {
      runHeuristicAnalysis();
    }
  }, []);

  const presetCounts = segments.reduce(
    (acc, s) => {
      acc[s.preset] = (acc[s.preset] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-[var(--accent-light)]" />
          AI Edit Presets
        </h3>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={analyzeWithAI}
            disabled={isAnalyzing || isApplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {isAnalyzing ? "Analisando..." : "Analisar com IA"}
          </button>
          <button
            onClick={applyPresets}
            disabled={isApplying || isAnalyzing || segments.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {isApplying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {isApplying ? "Aplicando..." : "Aplicar Presets"}
          </button>
        </div>

        {/* Status message */}
        {statusMessage && (
          <p className="text-[10px] text-[var(--text-secondary)] mt-2 text-center">
            {statusMessage}
          </p>
        )}
      </div>

      {/* Preset summary chips */}
      {segments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 border-b border-[var(--border)]">
          {presetOptions.map(preset => {
            const count = presetCounts[preset] || 0;
            if (count === 0) return null;
            const info = PRESET_INFO[preset];
            return (
              <span
                key={preset}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${info.color} ${info.bgColor}`}
              >
                {presetIcons[preset]}
                {info.label} ({count})
              </span>
            );
          })}
        </div>
      )}

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] text-sm p-4">
            <Wand2 className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-center">
              Clique em &quot;Analisar com IA&quot; para detectar automaticamente os segmentos
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {segments.map((segment) => (
              <SegmentItem
                key={segment.id}
                segment={segment}
                isExpanded={expandedId === segment.id}
                onToggle={() =>
                  setExpandedId(expandedId === segment.id ? null : segment.id)
                }
                onUpdate={(updates) => updateSegment(segment.id, updates)}
                onSeek={() => setCurrentTime(segment.startTime)}
                ref={(el) => {
                  if (el) itemRefs.current.set(segment.id, el);
                  else itemRefs.current.delete(segment.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { forwardRef } from "react";

const SegmentItem = forwardRef<
  HTMLDivElement,
  {
    segment: VideoSegment;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdate: (updates: Partial<VideoSegment>) => void;
    onSeek: () => void;
  }
>(function SegmentItem({ segment, isExpanded, onToggle, onUpdate, onSeek }, ref) {
  const info = PRESET_INFO[segment.preset];

  return (
    <div ref={ref} className="bg-[var(--surface)]">
      {/* Header row */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
        onClick={onToggle}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSeek();
          }}
          className="text-xs font-mono text-[var(--accent-light)] hover:underline shrink-0"
        >
          {formatTime(segment.startTime)}
        </button>

        {/* Preset badge */}
        <span
          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${info.color} ${info.bgColor} shrink-0`}
        >
          {presetIcons[segment.preset]}
          {info.label}
        </span>

        {/* Text preview */}
        <p className="text-xs truncate flex-1 text-[var(--text-secondary)]">
          {segment.text}
        </p>

        {/* Keyword highlight */}
        {segment.keywordHighlight && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 font-medium shrink-0">
            {segment.keywordHighlight}
          </span>
        )}

        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Preset selector */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
              Preset
            </label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {presetOptions.map(preset => {
                const pInfo = PRESET_INFO[preset];
                const isActive = segment.preset === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => onUpdate({ preset })}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                      isActive
                        ? `${pInfo.bgColor} ${pInfo.color} border-current`
                        : "bg-[var(--background)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {presetIcons[preset]}
                    {pInfo.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              {info.description}
            </p>
          </div>

          {/* Keyword highlight editor */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
              Palavra-chave destaque
            </label>
            <input
              type="text"
              value={segment.keywordHighlight}
              onChange={(e) => onUpdate({ keywordHighlight: e.target.value })}
              className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
              placeholder="Ex: inteligência artificial"
            />
          </div>

          {/* B-Roll query (only for presets that use B-Roll) */}
          {(segment.preset === "talking-head-broll" || segment.preset === "futuristic-hud") && (
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                Prompt B-Roll
              </label>
              <textarea
                value={segment.brollQuery}
                onChange={(e) => onUpdate({ brollQuery: e.target.value })}
                className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg resize-none focus:border-[var(--accent)] focus:outline-none"
                rows={2}
                placeholder="Descrição para gerar imagem de B-Roll"
              />
            </div>
          )}

          {/* Timing info */}
          <div className="flex items-center gap-4 text-[10px] text-[var(--text-secondary)]">
            <span>
              {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
            </span>
            <span>
              {(segment.endTime - segment.startTime).toFixed(1)}s
            </span>
            <span>
              Confiança: {Math.round(segment.confidence * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
