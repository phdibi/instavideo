"use client";

import { useMemo } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { getCurrentMode } from "@/lib/modes";
import { formatTime } from "@/lib/formatTime";
import BRollSwapGrid from "../BRollSwapGrid";
import type { BRollEffect, BRollLayout } from "@/types";
import {
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Clapperboard,
  Waves,
  Square,
  Maximize,
  Columns2,
  PictureInPicture2,
  Clapperboard as CinematicIcon,
  Diamond,
  Plus,
  Trash2,
  Copy,
} from "lucide-react";
import SegmentNavigator from "../SegmentNavigator";

const EFFECTS: { value: BRollEffect; label: string; icon: React.ReactNode }[] = [
  { value: "static", label: "Estático", icon: <Square className="w-4 h-4" /> },
  { value: "zoom-in", label: "Zoom In", icon: <ZoomIn className="w-4 h-4" /> },
  { value: "zoom-out", label: "Zoom Out", icon: <ZoomOut className="w-4 h-4" /> },
  { value: "pan-left", label: "Pan ←", icon: <ArrowLeft className="w-4 h-4" /> },
  { value: "pan-right", label: "Pan →", icon: <ArrowRight className="w-4 h-4" /> },
  { value: "pan-up", label: "Pan ↑", icon: <ArrowUp className="w-4 h-4" /> },
  { value: "pan-down", label: "Pan ↓", icon: <ArrowDown className="w-4 h-4" /> },
  { value: "ken-burns", label: "Ken Burns", icon: <Clapperboard className="w-4 h-4" /> },
  { value: "parallax", label: "Parallax", icon: <Waves className="w-4 h-4" /> },
];

const LAYOUTS: { value: BRollLayout; label: string; icon: React.ReactNode }[] = [
  { value: "fullscreen", label: "Tela cheia", icon: <Maximize className="w-4 h-4" /> },
  { value: "split", label: "Split", icon: <Columns2 className="w-4 h-4" /> },
  { value: "overlay", label: "Overlay", icon: <PictureInPicture2 className="w-4 h-4" /> },
  { value: "pip", label: "PIP", icon: <PictureInPicture2 className="w-4 h-4" /> },
  { value: "cinematic", label: "Cinematic", icon: <CinematicIcon className="w-4 h-4" /> },
  { value: "diagonal", label: "Diagonal", icon: <Diamond className="w-4 h-4" /> },
];

export default function BRollPanel() {
  const { modeSegments, selectedItem, currentTime, videoDuration, updateModeSegment, deleteModeSegment, splitSegmentForBroll, setCurrentTime, setSelectedItem } = useProjectStore(
    useShallow((s) => ({
      modeSegments: s.modeSegments,
      selectedItem: s.selectedItem,
      currentTime: s.currentTime,
      videoDuration: s.videoDuration,
      updateModeSegment: s.updateModeSegment,
      deleteModeSegment: s.deleteModeSegment,
      splitSegmentForBroll: s.splitSegmentForBroll,
      setCurrentTime: s.setCurrentTime,
      setSelectedItem: s.setSelectedItem,
    }))
  );

  const selectedSegment = modeSegments.find(
    (s) =>
      s.mode === "broll" &&
      selectedItem?.type === "segment" &&
      selectedItem.id === s.id
  );

  const selectedPresenterSegment = modeSegments.find(
    (s) =>
      s.mode === "presenter" &&
      selectedItem?.type === "segment" &&
      selectedItem.id === s.id
  );

  // Check if playhead is on a presenter segment (for "Add B-Roll" button)
  const currentSegment = getCurrentMode(modeSegments, currentTime);
  const playheadOnPresenter = currentSegment?.mode === "presenter";

  // All b-roll segments for the list view (must be before any early return to respect hooks rules)
  const brollSegments = useMemo(
    () => modeSegments.filter((s) => s.mode === "broll").sort((a, b) => a.startTime - b.startTime),
    [modeSegments]
  );

  const presenterSegments = useMemo(
    () => modeSegments.filter((s) => s.mode === "presenter").sort((a, b) => a.startTime - b.startTime),
    [modeSegments]
  );

  // Presenter segment selected — show zoom controls
  if (selectedPresenterSegment) {
    const currentZoom = selectedPresenterSegment.presenterZoom;
    const currentZoomIntensity = selectedPresenterSegment.presenterZoomIntensity ?? 1.0;
    return (
      <div className="p-4 space-y-5">
        {/* Presenter navigation */}
        <SegmentNavigator
          items={presenterSegments.map((s) => ({ id: s.id, time: s.startTime }))}
          currentId={selectedPresenterSegment.id}
          label="Presenter"
          colorClass="text-blue-300"
          onSelect={(id, time) => { setCurrentTime(time); setSelectedItem({ type: "segment", id }); }}
        />
        {/* Trim controls */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">Início</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newStart = Math.max(0, selectedPresenterSegment.startTime - 0.5);
                  if (selectedPresenterSegment.endTime - newStart >= 0.3)
                    updateModeSegment(selectedPresenterSegment.id, { startTime: newStart });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >◀</button>
              <span className="text-xs font-mono w-12 text-center">{selectedPresenterSegment.startTime.toFixed(1)}s</span>
              <button
                onClick={() => {
                  const newStart = Math.min(selectedPresenterSegment.endTime - 0.3, selectedPresenterSegment.startTime + 0.5);
                  updateModeSegment(selectedPresenterSegment.id, { startTime: newStart });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >▶</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">Fim</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newEnd = Math.max(selectedPresenterSegment.startTime + 0.3, selectedPresenterSegment.endTime - 0.5);
                  updateModeSegment(selectedPresenterSegment.id, { endTime: newEnd });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >◀</button>
              <span className="text-xs font-mono w-12 text-center">{selectedPresenterSegment.endTime.toFixed(1)}s</span>
              <button
                onClick={() => {
                  const newEnd = Math.min(videoDuration || 9999, selectedPresenterSegment.endTime + 0.5);
                  if (newEnd - selectedPresenterSegment.startTime >= 0.3)
                    updateModeSegment(selectedPresenterSegment.id, { endTime: newEnd });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >▶</button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Zoom
          </label>
          <div className="flex gap-1.5">
            {([
              { value: "auto", label: "Auto" },
              { value: "none", label: "Nenhum" },
              { value: "zoom-in", label: "Zoom In" },
              { value: "zoom-out", label: "Zoom Out" },
              { value: "parallax", label: "Parallax" },
            ] as const).map((opt) => {
              const isActive = opt.value === "auto"
                ? currentZoom === undefined
                : currentZoom === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateModeSegment(selectedPresenterSegment.id, {
                    presenterZoom: opt.value === "auto" ? undefined : opt.value,
                  })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-blue-500 text-white"
                      : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {currentZoom !== "none" && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Estilo
              </label>
              <div className="flex gap-1.5">
                {([
                  { value: "smooth" as const, label: "Suave" },
                  { value: "abrupt" as const, label: "Abrupto" },
                ]).map((opt) => {
                  const currentEasing = selectedPresenterSegment.presenterZoomEasing ?? "smooth";
                  const isActive = currentEasing === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateModeSegment(selectedPresenterSegment.id, {
                        presenterZoomEasing: opt.value,
                      })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? "bg-blue-500 text-white"
                          : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Intensidade: {currentZoomIntensity.toFixed(1)}x
              </label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={currentZoomIntensity}
                onChange={(e) =>
                  updateModeSegment(selectedPresenterSegment.id, {
                    presenterZoomIntensity: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Zoom Início: {Math.round((selectedPresenterSegment.presenterZoomStart ?? 0) * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selectedPresenterSegment.presenterZoomStart ?? 0}
                onChange={(e) =>
                  updateModeSegment(selectedPresenterSegment.id, {
                    presenterZoomStart: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Zoom Fim: {Math.round((selectedPresenterSegment.presenterZoomEnd ?? 1) * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selectedPresenterSegment.presenterZoomEnd ?? 1}
                onChange={(e) =>
                  updateModeSegment(selectedPresenterSegment.id, {
                    presenterZoomEnd: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </>
        )}

        {/* Apply zoom settings to all presenter segments */}
        {presenterSegments.length > 1 && (
          <button
            onClick={() => {
              for (const seg of presenterSegments) {
                if (seg.id === selectedPresenterSegment.id) continue;
                updateModeSegment(seg.id, {
                  presenterZoom: selectedPresenterSegment.presenterZoom,
                  presenterZoomIntensity: currentZoomIntensity,
                  presenterZoomEasing: selectedPresenterSegment.presenterZoomEasing,
                  presenterZoomStart: selectedPresenterSegment.presenterZoomStart,
                  presenterZoomEnd: selectedPresenterSegment.presenterZoomEnd,
                });
              }
            }}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Aplicar a todos os Presenters
          </button>
        )}

        {playheadOnPresenter && currentSegment && (
          <button
            onClick={() => splitSegmentForBroll(currentSegment.id, currentTime)}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar B-Roll aqui
          </button>
        )}
      </div>
    );
  }

  if (!selectedSegment) {
    return (
      <div className="p-4 space-y-4">
        {brollSegments.length > 0 ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              Segmentos B-Roll
            </label>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {brollSegments.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => {
                    setCurrentTime(seg.startTime);
                    setSelectedItem({ type: "segment", id: seg.id });
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-all"
                >
                  <span className="font-semibold text-orange-400">
                    {formatTime(seg.startTime)} – {formatTime(seg.endTime)}
                  </span>
                  {seg.brollQuery && (
                    <p className="text-[var(--text-secondary)] truncate mt-0.5">{seg.brollQuery}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-4">
            Selecione um segmento B-Roll na timeline para editar.
          </p>
        )}
        {playheadOnPresenter && currentSegment && (
          <button
            onClick={() => splitSegmentForBroll(currentSegment.id, currentTime)}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar B-Roll aqui
          </button>
        )}
      </div>
    );
  }

  const currentEffect = selectedSegment.brollEffect || "static";
  const currentIntensity = selectedSegment.brollEffectIntensity ?? 1.0;
  const currentLayout = selectedSegment.brollLayout || "fullscreen";

  return (
    <div className="space-y-5 overflow-y-auto max-h-full">
      {/* B-Roll navigation */}
      <div className="px-4 pt-4 space-y-2">
        <SegmentNavigator
          items={brollSegments.map((s) => ({ id: s.id, time: s.startTime }))}
          currentId={selectedSegment.id}
          label="B-Roll"
          colorClass="text-orange-300"
          onSelect={(id, time) => { setCurrentTime(time); setSelectedItem({ type: "segment", id }); }}
        />
        {/* Trim controls */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">Início</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newStart = Math.max(0, selectedSegment.startTime - 0.5);
                  if (selectedSegment.endTime - newStart >= 0.3)
                    updateModeSegment(selectedSegment.id, { startTime: newStart });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >◀</button>
              <span className="text-xs font-mono w-12 text-center">{selectedSegment.startTime.toFixed(1)}s</span>
              <button
                onClick={() => {
                  const newStart = Math.min(selectedSegment.endTime - 0.3, selectedSegment.startTime + 0.5);
                  updateModeSegment(selectedSegment.id, { startTime: newStart });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >▶</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">Fim</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newEnd = Math.max(selectedSegment.startTime + 0.3, selectedSegment.endTime - 0.5);
                  updateModeSegment(selectedSegment.id, { endTime: newEnd });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >◀</button>
              <span className="text-xs font-mono w-12 text-center">{selectedSegment.endTime.toFixed(1)}s</span>
              <button
                onClick={() => {
                  const newEnd = Math.min(videoDuration || 9999, selectedSegment.endTime + 0.5);
                  if (newEnd - selectedSegment.startTime >= 0.3)
                    updateModeSegment(selectedSegment.id, { endTime: newEnd });
                }}
                className="w-7 h-7 rounded-md bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] text-xs"
              >▶</button>
            </div>
          </div>
        </div>
        {selectedSegment.brollQuery && (
          <p className="text-xs text-[var(--text-secondary)]">
            Query: <span className="text-[var(--foreground)]">{selectedSegment.brollQuery}</span>
          </p>
        )}
      </div>

      {/* Layout selector */}
      <div className="px-4 space-y-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Layout
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.value}
              onClick={() =>
                updateModeSegment(selectedSegment.id, { brollLayout: l.value })
              }
              className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg text-[10px] transition-all ${
                currentLayout === l.value
                  ? "bg-orange-500 text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {l.icon}
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Effect selector */}
      <div className="px-4 space-y-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Efeito
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {EFFECTS.map((fx) => (
            <button
              key={fx.value}
              onClick={() =>
                updateModeSegment(selectedSegment.id, { brollEffect: fx.value })
              }
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] transition-all ${
                currentEffect === fx.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {fx.icon}
              {fx.label}
            </button>
          ))}
        </div>
      </div>

      {/* Intensity slider */}
      <div className="px-4 space-y-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Intensidade: {currentIntensity.toFixed(1)}x
        </label>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={currentIntensity}
          onChange={(e) =>
            updateModeSegment(selectedSegment.id, {
              brollEffectIntensity: parseFloat(e.target.value),
            })
          }
          className="w-full"
        />
      </div>

      {/* B-Roll swap grid */}
      <BRollSwapGrid segment={selectedSegment} />

      {/* Apply to all b-roll segments */}
      {brollSegments.length > 1 && (
        <div className="px-4">
          <button
            onClick={() => {
              for (const seg of brollSegments) {
                if (seg.id === selectedSegment.id) continue;
                updateModeSegment(seg.id, {
                  brollLayout: currentLayout,
                  brollEffect: currentEffect,
                  brollEffectIntensity: currentIntensity,
                });
              }
            }}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Aplicar a todos os B-Rolls
          </button>
        </div>
      )}

      {/* Remove B-Roll button */}
      <div className="px-4 pb-4">
        <button
          onClick={() => deleteModeSegment(selectedSegment.id)}
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Remover B-Roll
        </button>
      </div>
    </div>
  );
}
