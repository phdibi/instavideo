"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  ZoomIn,
  Move,
  Layers,
  Zap,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";
import { v4 as uuid } from "uuid";
import type { EditEffect, EffectType } from "@/types";

const effectCategories = [
  {
    label: "Zoom",
    icon: <ZoomIn className="w-3.5 h-3.5" />,
    effects: [
      { type: "zoom-in" as EffectType, label: "Zoom In" },
      { type: "zoom-out" as EffectType, label: "Zoom Out" },
      { type: "zoom-pulse" as EffectType, label: "Zoom Pulse" },
    ],
  },
  {
    label: "Movimento",
    icon: <Move className="w-3.5 h-3.5" />,
    effects: [
      { type: "pan-left" as EffectType, label: "Pan Esquerda" },
      { type: "pan-right" as EffectType, label: "Pan Direita" },
      { type: "pan-up" as EffectType, label: "Pan Cima" },
      { type: "pan-down" as EffectType, label: "Pan Baixo" },
      { type: "shake" as EffectType, label: "Shake" },
    ],
  },
  {
    label: "Transições",
    icon: <Layers className="w-3.5 h-3.5" />,
    effects: [
      { type: "transition-fade" as EffectType, label: "Fade" },
      { type: "transition-swipe" as EffectType, label: "Swipe" },
      { type: "transition-zoom" as EffectType, label: "Zoom Trans" },
      { type: "transition-glitch" as EffectType, label: "Glitch" },
    ],
  },
  {
    label: "Visuais",
    icon: <Zap className="w-3.5 h-3.5" />,
    effects: [
      { type: "vignette" as EffectType, label: "Vinheta" },
      { type: "letterbox" as EffectType, label: "Letterbox" },
      { type: "flash" as EffectType, label: "Flash" },
      { type: "color-grade" as EffectType, label: "Color Grade" },
      { type: "blur-background" as EffectType, label: "Blur BG" },
      { type: "slow-motion" as EffectType, label: "Slow Motion" },
      { type: "speed-ramp" as EffectType, label: "Speed Ramp" },
    ],
  },
];

const defaultParams: Record<string, Record<string, unknown>> = {
  "zoom-in": { scale: 1.3, focusX: 0.5, focusY: 0.4, easing: "ease-out" },
  "zoom-out": { scale: 1.3, easing: "ease-in" },
  "zoom-pulse": { scale: 1.2 },
  "pan-left": { distance: 30, easing: "ease-in-out" },
  "pan-right": { distance: 30, easing: "ease-in-out" },
  "pan-up": { distance: 20, easing: "ease-in-out" },
  "pan-down": { distance: 20, easing: "ease-in-out" },
  shake: { intensity: 3, frequency: 15 },
  "transition-fade": { duration: 0.5 },
  "transition-swipe": { direction: "left", duration: 0.5 },
  "transition-zoom": { duration: 0.5 },
  "transition-glitch": { intensity: 5, duration: 0.5 },
  vignette: { intensity: 0.3 },
  letterbox: { amount: 0.1 },
  flash: { color: "#FFFFFF", duration: 0.15 },
  "color-grade": { preset: "cinematic-warm" },
  "blur-background": { amount: 5 },
  "slow-motion": { speed: 0.5 },
  "speed-ramp": { startSpeed: 1.0, endSpeed: 1.5 },
};

export default function EffectsEditor() {
  const { effects, updateEffect, deleteEffect, setEffects, currentTime, setCurrentTime, selectedItem } =
    useProjectStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Sort effects by startTime (like captions)
  const sortedEffects = useMemo(
    () => [...effects].sort((a, b) => a.startTime - b.startTime),
    [effects]
  );

  // Auto-expand and scroll to selected effect from timeline
  useEffect(() => {
    if (selectedItem?.type === "effect") {
      setExpandedId(selectedItem.id);
      requestAnimationFrame(() => {
        const el = itemRefs.current.get(selectedItem.id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  }, [selectedItem]);

  const addEffect = (type: EffectType) => {
    const newEffect: EditEffect = {
      id: uuid(),
      type,
      startTime: currentTime,
      endTime: Math.min(
        currentTime + 1.5,
        useProjectStore.getState().videoDuration
      ),
      params: defaultParams[type] || {},
    };
    setEffects(
      [...effects, newEffect].sort((a, b) => a.startTime - b.startTime)
    );
    setExpandedId(newEffect.id);
    setShowAdd(false);
  };

  const getEffectColor = (type: string) => {
    if (type.startsWith("zoom")) return "text-blue-400 bg-blue-400/10";
    if (type.startsWith("pan") || type === "shake")
      return "text-green-400 bg-green-400/10";
    if (type.startsWith("transition"))
      return "text-yellow-400 bg-yellow-400/10";
    return "text-purple-400 bg-purple-400/10";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-light)]" />
          Efeitos ({effects.length})
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--accent-light)]"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showAdd && (
        <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)] space-y-3">
          {effectCategories.map((cat) => (
            <div key={cat.label}>
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-1 mb-1.5">
                {cat.icon} {cat.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {cat.effects.map((e) => (
                  <button
                    key={e.type}
                    onClick={() => addEffect(e.type)}
                    className="px-2 py-1 text-xs rounded-md bg-[var(--background)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sortedEffects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] text-sm p-4">
            <Sparkles className="w-8 h-8 mb-2 opacity-50" />
            <p>Nenhum efeito</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {sortedEffects.map((effect) => {
              const isSelected = selectedItem?.type === "effect" && selectedItem.id === effect.id;
              return (
                <div
                  key={effect.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(effect.id, el);
                    else itemRefs.current.delete(effect.id);
                  }}
                  className={`bg-[var(--surface)] ${isSelected ? "ring-1 ring-[var(--accent)]/50 bg-[var(--accent)]/5" : ""}`}
                >
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                    onClick={() =>
                      setExpandedId(
                        expandedId === effect.id ? null : effect.id
                      )
                    }
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentTime(effect.startTime);
                      }}
                      className="text-xs font-mono text-[var(--accent-light)] hover:underline shrink-0"
                    >
                      {formatTime(effect.startTime)}
                    </button>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${getEffectColor(
                        effect.type
                      )} shrink-0`}
                    >
                      {effect.type}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] ml-auto shrink-0">
                      {(effect.endTime - effect.startTime).toFixed(1)}s
                    </span>
                    {expandedId === effect.id ? (
                      <ChevronUp className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    )}
                  </div>

                  {expandedId === effect.id && (
                    <div className="px-3 pb-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                            Início (s)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={effect.startTime}
                            onChange={(e) =>
                              updateEffect(effect.id, {
                                startTime: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                            Fim (s)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={effect.endTime}
                            onChange={(e) =>
                              updateEffect(effect.id, {
                                endTime: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Dynamic params editor */}
                      <div>
                        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                          Parâmetros
                        </label>
                        <div className="space-y-2 mt-1">
                          {Object.entries(effect.params).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-xs text-[var(--text-secondary)] w-20 shrink-0">
                                {key}
                              </span>
                              {typeof val === "number" ? (
                                <input
                                  type="number"
                                  step={val < 1 ? "0.05" : "0.1"}
                                  value={val}
                                  onChange={(e) =>
                                    updateEffect(effect.id, {
                                      params: {
                                        ...effect.params,
                                        [key]: parseFloat(e.target.value),
                                      },
                                    })
                                  }
                                  className="flex-1 p-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={String(val)}
                                  onChange={(e) =>
                                    updateEffect(effect.id, {
                                      params: {
                                        ...effect.params,
                                        [key]: e.target.value,
                                      },
                                    })
                                  }
                                  className="flex-1 p-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => deleteEffect(effect.id)}
                        className="flex items-center gap-1 text-xs text-[var(--danger)] hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remover efeito
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
