"use client";

import { useState } from "react";
import {
  Type,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  Palette,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";
import { v4 as uuid } from "uuid";
import type { Caption, CaptionAnimation, CaptionStyle } from "@/types";

const animations: { value: CaptionAnimation; label: string }[] = [
  { value: "none", label: "Nenhuma" },
  { value: "fade", label: "Fade" },
  { value: "pop", label: "Pop" },
  { value: "bounce", label: "Bounce" },
  { value: "slide-up", label: "Slide Up" },
  { value: "typewriter", label: "Máquina de Escrever" },
  { value: "karaoke", label: "Karaokê" },
  { value: "highlight-word", label: "Destaque" },
];

const presetStyles: { name: string; style: Partial<CaptionStyle> }[] = [
  {
    name: "Clássico",
    style: {
      color: "#FFFFFF",
      backgroundColor: "#000000",
      backgroundOpacity: 0.7,
      fontSize: 48,
      fontWeight: 700,
      strokeWidth: 0,
    },
  },
  {
    name: "Neon",
    style: {
      color: "#00FF88",
      backgroundColor: "transparent",
      backgroundOpacity: 0,
      fontSize: 52,
      fontWeight: 900,
      strokeColor: "#000000",
      strokeWidth: 3,
      shadowColor: "rgba(0,255,136,0.6)",
      shadowBlur: 15,
    },
  },
  {
    name: "Minimalista",
    style: {
      color: "#FFFFFF",
      backgroundColor: "transparent",
      backgroundOpacity: 0,
      fontSize: 40,
      fontWeight: 500,
      strokeColor: "#000000",
      strokeWidth: 2,
    },
  },
  {
    name: "Bold Box",
    style: {
      color: "#FFFFFF",
      backgroundColor: "#7C3AED",
      backgroundOpacity: 0.9,
      fontSize: 44,
      fontWeight: 800,
      strokeWidth: 0,
    },
  },
  {
    name: "Amarelo Viral",
    style: {
      color: "#FFD700",
      backgroundColor: "transparent",
      backgroundOpacity: 0,
      fontSize: 56,
      fontWeight: 900,
      strokeColor: "#000000",
      strokeWidth: 3,
    },
  },
  {
    name: "Cinematográfico",
    style: {
      color: "#E8E8ED",
      backgroundColor: "transparent",
      backgroundOpacity: 0,
      fontSize: 36,
      fontWeight: 400,
      strokeWidth: 0,
      shadowColor: "rgba(0,0,0,0.8)",
      shadowBlur: 8,
    },
  },
];

export default function CaptionEditor() {
  const {
    captions,
    updateCaption,
    deleteCaption,
    setCaptions,
    currentTime,
    setCurrentTime,
  } = useProjectStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const addCaption = () => {
    const newCaption: Caption = {
      id: uuid(),
      startTime: currentTime,
      endTime: Math.min(currentTime + 3, useProjectStore.getState().videoDuration),
      text: "Nova legenda",
      style: {
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
      },
      animation: "pop",
      emphasis: [],
    };
    setCaptions([...captions, newCaption].sort((a, b) => a.startTime - b.startTime));
    setExpandedId(newCaption.id);
  };

  const applyPresetToAll = (preset: Partial<CaptionStyle>) => {
    captions.forEach((c) => {
      updateCaption(c.id, { style: { ...c.style, ...preset } });
    });
    setShowPresets(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Type className="w-4 h-4 text-[var(--accent-light)]" />
          Legendas ({captions.length})
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            title="Estilos pré-definidos"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
            onClick={addCaption}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--accent-light)]"
            title="Adicionar legenda"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showPresets && (
        <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Aplicar estilo a todas as legendas:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {presetStyles.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPresetToAll(p.style)}
                className="px-2 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {captions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] text-sm p-4">
            <Type className="w-8 h-8 mb-2 opacity-50" />
            <p>Nenhuma legenda ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {captions.map((caption) => (
              <CaptionItem
                key={caption.id}
                caption={caption}
                isExpanded={expandedId === caption.id}
                onToggle={() =>
                  setExpandedId(expandedId === caption.id ? null : caption.id)
                }
                onUpdate={(updates) => updateCaption(caption.id, updates)}
                onDelete={() => deleteCaption(caption.id)}
                onSeek={() => setCurrentTime(caption.startTime)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CaptionItem({
  caption,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onSeek,
}: {
  caption: Caption;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Caption>) => void;
  onDelete: () => void;
  onSeek: () => void;
}) {
  return (
    <div className="bg-[var(--surface)]">
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
          {formatTime(caption.startTime)}
        </button>
        <p className="text-sm truncate flex-1">{caption.text}</p>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent-light)] shrink-0">
          {caption.animation}
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
        )}
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Text */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
              Texto
            </label>
            <textarea
              value={caption.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg resize-none focus:border-[var(--accent)] focus:outline-none"
              rows={2}
            />
          </div>

          {/* Timing */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                Início (s)
              </label>
              <input
                type="number"
                step="0.1"
                value={caption.startTime}
                onChange={(e) =>
                  onUpdate({ startTime: parseFloat(e.target.value) || 0 })
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
                value={caption.endTime}
                onChange={(e) =>
                  onUpdate({ endTime: parseFloat(e.target.value) || 0 })
                }
                className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Animation */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
              Animação
            </label>
            <select
              value={caption.animation}
              onChange={(e) =>
                onUpdate({ animation: e.target.value as CaptionAnimation })
              }
              className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
            >
              {animations.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                Cor
              </label>
              <input
                type="color"
                value={caption.style.color}
                onChange={(e) =>
                  onUpdate({
                    style: { ...caption.style, color: e.target.value },
                  })
                }
                className="w-full mt-1 h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                BG
              </label>
              <input
                type="color"
                value={caption.style.backgroundColor}
                onChange={(e) =>
                  onUpdate({
                    style: {
                      ...caption.style,
                      backgroundColor: e.target.value,
                    },
                  })
                }
                className="w-full mt-1 h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
                Tamanho
              </label>
              <input
                type="number"
                value={caption.style.fontSize}
                onChange={(e) =>
                  onUpdate({
                    style: {
                      ...caption.style,
                      fontSize: parseInt(e.target.value) || 48,
                    },
                  })
                }
                className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
              Posição
            </label>
            <div className="flex gap-1 mt-1">
              {(["top", "center", "bottom"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() =>
                    onUpdate({
                      style: { ...caption.style, position: pos },
                    })
                  }
                  className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${
                    caption.style.position === pos
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {pos === "top" ? "Topo" : pos === "center" ? "Centro" : "Base"}
                </button>
              ))}
            </div>
          </div>

          {/* Emphasis words */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
              Palavras de destaque (separadas por vírgula)
            </label>
            <input
              type="text"
              value={caption.emphasis.join(", ")}
              onChange={(e) =>
                onUpdate({
                  emphasis: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="w-full mt-1 p-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:border-[var(--accent)] focus:outline-none"
              placeholder="palavra1, palavra2"
            />
          </div>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-xs text-[var(--danger)] hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remover legenda
          </button>
        </div>
      )}
    </div>
  );
}
