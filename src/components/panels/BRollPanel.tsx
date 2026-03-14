"use client";

import { useProjectStore } from "@/store/useProjectStore";
import BRollSwapGrid from "../BRollSwapGrid";
import type { BRollEffect } from "@/types";
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
} from "lucide-react";

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

export default function BRollPanel() {
  const { modeSegments, selectedItem, updateModeSegment } = useProjectStore();

  const selectedSegment = modeSegments.find(
    (s) =>
      s.mode === "broll" &&
      selectedItem?.type === "segment" &&
      selectedItem.id === s.id
  );

  if (!selectedSegment) {
    return (
      <div className="p-4 text-sm text-zinc-500 text-center py-8">
        Selecione um segmento B-Roll na timeline para editar.
      </div>
    );
  }

  const currentEffect = selectedSegment.brollEffect || "static";
  const currentIntensity = selectedSegment.brollEffectIntensity ?? 1.0;

  return (
    <div className="space-y-5 overflow-y-auto max-h-full">
      {/* Segment info */}
      <div className="px-4 pt-4">
        <p className="text-xs text-[var(--text-secondary)]">
          Segmento: {selectedSegment.startTime.toFixed(1)}s – {selectedSegment.endTime.toFixed(1)}s
        </p>
        {selectedSegment.brollQuery && (
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Query: <span className="text-[var(--foreground)]">{selectedSegment.brollQuery}</span>
          </p>
        )}
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
    </div>
  );
}
