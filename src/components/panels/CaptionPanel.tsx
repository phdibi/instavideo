"use client";

import { useMemo } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { AVAILABLE_FONTS } from "@/lib/fonts";
import type { CaptionConfig } from "@/types";
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";

const PRESETS: { name: string; config: Partial<CaptionConfig> }[] = [
  {
    name: "Clean White",
    config: {
      fontFamily: "Inter",
      fontWeight: 800,
      color: "#FFFFFF",
      strokeWidth: 0,
      shadowBlur: 8,
      shadowColor: "rgba(0,0,0,0.7)",
    },
  },
  {
    name: "Neon Glow",
    config: {
      fontFamily: "Bebas Neue",
      fontWeight: 400,
      color: "#00FF88",
      strokeWidth: 0,
      shadowBlur: 16,
      shadowColor: "rgba(0,255,136,0.6)",
    },
  },
  {
    name: "Outlined",
    config: {
      fontFamily: "Montserrat",
      fontWeight: 900,
      color: "#FFFFFF",
      strokeWidth: 2,
      strokeColor: "#000000",
      shadowBlur: 0,
    },
  },
  {
    name: "Shadowed",
    config: {
      fontFamily: "Oswald",
      fontWeight: 700,
      color: "#FFFFFF",
      strokeWidth: 0,
      shadowBlur: 20,
      shadowColor: "rgba(0,0,0,0.9)",
    },
  },
  {
    name: "Bold Yellow",
    config: {
      fontFamily: "Anton",
      fontWeight: 400,
      color: "#FFD700",
      strokeWidth: 2,
      strokeColor: "#000000",
      shadowBlur: 4,
      shadowColor: "rgba(0,0,0,0.5)",
    },
  },
];

const COLOR_SWATCHES = [
  "#FFFFFF", "#000000", "#FFD700", "#FF4444", "#00FF88",
  "#00AAFF", "#FF66FF", "#FF8800", "#CCFF00", "#8B5CF6",
];

const WEIGHTS = [400, 600, 700, 800, 900];

const ANIMATIONS: { value: CaptionConfig["animation"]; label: string }[] = [
  { value: "none", label: "Nenhuma" },
  { value: "fade", label: "Fade" },
  { value: "pop", label: "Pop" },
  { value: "slide-up", label: "Slide Up" },
  { value: "typewriter", label: "Typewriter" },
];

export default function CaptionPanel() {
  const {
    captionConfig,
    setCaptionConfig,
    phraseCaptions,
    selectedItem,
    setSelectedItem,
    updatePhraseCaption,
    deletePhraseCaption,
    setPhraseCaptions,
    setCurrentTime,
  } = useProjectStore();

  // Get selected phrase and its neighbors
  const selectedPhrase = useMemo(() => {
    if (selectedItem?.type !== "phrase") return null;
    return phraseCaptions.find((c) => c.id === selectedItem.id) || null;
  }, [selectedItem, phraseCaptions]);

  const sorted = useMemo(
    () => [...phraseCaptions].sort((a, b) => a.startTime - b.startTime),
    [phraseCaptions]
  );

  const selectedIdx = selectedPhrase
    ? sorted.findIndex((c) => c.id === selectedPhrase.id)
    : -1;
  const prevPhrase = selectedIdx > 0 ? sorted[selectedIdx - 1] : null;
  const nextPhrase = selectedIdx >= 0 && selectedIdx < sorted.length - 1 ? sorted[selectedIdx + 1] : null;

  // Move the first word of selected phrase to end of previous phrase
  const moveWordToPrev = () => {
    if (!selectedPhrase || !prevPhrase) return;
    const words = selectedPhrase.text.split(" ");
    if (words.length <= 1) return;
    const wordToMove = words[0];
    const remaining = words.slice(1).join(" ");
    updatePhraseCaption(prevPhrase.id, {
      text: prevPhrase.text + " " + wordToMove,
      endTime: selectedPhrase.startTime + (selectedPhrase.endTime - selectedPhrase.startTime) * (1 / words.length),
    });
    updatePhraseCaption(selectedPhrase.id, {
      text: remaining,
      startTime: selectedPhrase.startTime + (selectedPhrase.endTime - selectedPhrase.startTime) * (1 / words.length),
    });
  };

  // Move the last word of selected phrase to beginning of next phrase
  const moveWordToNext = () => {
    if (!selectedPhrase || !nextPhrase) return;
    const words = selectedPhrase.text.split(" ");
    if (words.length <= 1) return;
    const wordToMove = words[words.length - 1];
    const remaining = words.slice(0, -1).join(" ");
    const splitTime = selectedPhrase.startTime + (selectedPhrase.endTime - selectedPhrase.startTime) * ((words.length - 1) / words.length);
    updatePhraseCaption(selectedPhrase.id, {
      text: remaining,
      endTime: splitTime,
    });
    updatePhraseCaption(nextPhrase.id, {
      text: wordToMove + " " + nextPhrase.text,
      startTime: splitTime,
    });
  };

  // Move last word of previous phrase to beginning of selected
  const pullWordFromPrev = () => {
    if (!selectedPhrase || !prevPhrase) return;
    const prevWords = prevPhrase.text.split(" ");
    if (prevWords.length <= 1) return;
    const wordToMove = prevWords[prevWords.length - 1];
    const remaining = prevWords.slice(0, -1).join(" ");
    const splitTime = prevPhrase.startTime + (prevPhrase.endTime - prevPhrase.startTime) * ((prevWords.length - 1) / prevWords.length);
    updatePhraseCaption(prevPhrase.id, {
      text: remaining,
      endTime: splitTime,
    });
    updatePhraseCaption(selectedPhrase.id, {
      text: wordToMove + " " + selectedPhrase.text,
      startTime: splitTime,
    });
  };

  // Move first word of next phrase to end of selected
  const pullWordFromNext = () => {
    if (!selectedPhrase || !nextPhrase) return;
    const nextWords = nextPhrase.text.split(" ");
    if (nextWords.length <= 1) return;
    const wordToMove = nextWords[0];
    const remaining = nextWords.slice(1).join(" ");
    const splitTime = nextPhrase.startTime + (nextPhrase.endTime - nextPhrase.startTime) * (1 / nextWords.length);
    updatePhraseCaption(selectedPhrase.id, {
      text: selectedPhrase.text + " " + wordToMove,
      endTime: splitTime,
    });
    updatePhraseCaption(nextPhrase.id, {
      text: remaining,
      startTime: splitTime,
    });
  };

  return (
    <div className="p-4 space-y-5 overflow-y-auto max-h-full">
      {/* ═══ Word Editor (when phrase selected) ═══ */}
      {selectedPhrase && (
        <Section title="Editar frase selecionada">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 space-y-3">
            {/* Current phrase display */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">
                {selectedPhrase.startTime.toFixed(1)}s – {selectedPhrase.endTime.toFixed(1)}s
              </span>
              <button
                onClick={() => {
                  deletePhraseCaption(selectedPhrase.id);
                  setSelectedItem(null);
                }}
                className="ml-auto p-1 rounded hover:bg-red-500/20 transition-colors"
                title="Deletar frase"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>

            {/* Words with navigation */}
            <div className="flex flex-wrap gap-1.5">
              {selectedPhrase.text.split(" ").map((word, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-white/10 rounded-md text-sm font-semibold"
                >
                  {word}
                </span>
              ))}
            </div>

            {/* Move buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={moveWordToPrev}
                disabled={!prevPhrase || selectedPhrase.text.split(" ").length <= 1}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Mover 1ª palavra para frase anterior"
              >
                <ChevronLeft className="w-3 h-3" />
                Enviar ←
              </button>
              <button
                onClick={moveWordToNext}
                disabled={!nextPhrase || selectedPhrase.text.split(" ").length <= 1}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Mover última palavra para frase seguinte"
              >
                Enviar →
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                onClick={pullWordFromPrev}
                disabled={!prevPhrase || (prevPhrase?.text.split(" ").length ?? 0) <= 1}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Puxar última palavra da frase anterior"
              >
                <ChevronRight className="w-3 h-3" />
                Puxar ←
              </button>
              <button
                onClick={pullWordFromNext}
                disabled={!nextPhrase || (nextPhrase?.text.split(" ").length ?? 0) <= 1}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Puxar 1ª palavra da frase seguinte"
              >
                <ChevronLeft className="w-3 h-3" />
                Puxar →
              </button>
            </div>

            {/* Context: show prev/next phrases */}
            <div className="space-y-1 pt-1 border-t border-[var(--border)]">
              {prevPhrase && (
                <button
                  onClick={() => {
                    setSelectedItem({ type: "phrase", id: prevPhrase.id });
                    setCurrentTime(prevPhrase.startTime);
                  }}
                  className="w-full text-left px-2 py-1 rounded-md text-[10px] text-[var(--text-secondary)] hover:bg-white/5 transition-colors truncate"
                >
                  ← {prevPhrase.text}
                </button>
              )}
              <div className="px-2 py-1 rounded-md text-xs font-bold text-white bg-white/10">
                {selectedPhrase.text}
              </div>
              {nextPhrase && (
                <button
                  onClick={() => {
                    setSelectedItem({ type: "phrase", id: nextPhrase.id });
                    setCurrentTime(nextPhrase.startTime);
                  }}
                  className="w-full text-left px-2 py-1 rounded-md text-[10px] text-[var(--text-secondary)] hover:bg-white/5 transition-colors truncate"
                >
                  {nextPhrase.text} →
                </button>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Presets */}
      <Section title="Presets">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setCaptionConfig(preset.config)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-hover)] hover:border-[var(--accent)]/50 transition-all"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </Section>

      {/* Font Family */}
      <Section title="Fonte">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {AVAILABLE_FONTS.map((font) => (
            <button
              key={font.name}
              onClick={() => setCaptionConfig({ fontFamily: font.name })}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                captionConfig.fontFamily === font.name
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
              style={{ fontFamily: font.family }}
            >
              {font.name}
            </button>
          ))}
        </div>
      </Section>

      {/* Font Size */}
      <Section title={`Tamanho: ${captionConfig.fontSize}px`}>
        <input
          type="range"
          min={24}
          max={72}
          step={1}
          value={captionConfig.fontSize}
          onChange={(e) => setCaptionConfig({ fontSize: parseInt(e.target.value) })}
          className="w-full"
        />
      </Section>

      {/* Font Weight */}
      <Section title="Peso">
        <div className="flex gap-1.5">
          {WEIGHTS.map((w) => (
            <button
              key={w}
              onClick={() => setCaptionConfig({ fontWeight: w })}
              className={`flex-1 py-1.5 rounded-lg text-xs transition-all ${
                captionConfig.fontWeight === w
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </Section>

      {/* Color */}
      <Section title="Cor">
        <div className="flex gap-2 items-center flex-wrap">
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              onClick={() => setCaptionConfig({ color })}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                captionConfig.color === color
                  ? "border-[var(--accent)] scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            type="text"
            value={captionConfig.color}
            onChange={(e) => setCaptionConfig({ color: e.target.value })}
            className="w-20 px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs font-mono"
            placeholder="#FFFFFF"
          />
        </div>
      </Section>

      {/* Stroke */}
      <Section title="Contorno">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCaptionConfig({ strokeWidth: captionConfig.strokeWidth > 0 ? 0 : 2 })}
              className={`px-3 py-1 rounded-lg text-xs transition-all ${
                captionConfig.strokeWidth > 0
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)]"
              }`}
            >
              {captionConfig.strokeWidth > 0 ? "ON" : "OFF"}
            </button>
            {captionConfig.strokeWidth > 0 && (
              <>
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.5}
                  value={captionConfig.strokeWidth}
                  onChange={(e) => setCaptionConfig({ strokeWidth: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-[var(--text-secondary)] w-8">{captionConfig.strokeWidth}px</span>
              </>
            )}
          </div>
          {captionConfig.strokeWidth > 0 && (
            <div className="flex gap-2">
              {["#000000", "#FFFFFF", "#FF0000", "#0000FF"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCaptionConfig({ strokeColor: c })}
                  className={`w-6 h-6 rounded-full border-2 ${
                    captionConfig.strokeColor === c ? "border-[var(--accent)]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Shadow */}
      <Section title={`Sombra: ${captionConfig.shadowBlur}px`}>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={captionConfig.shadowBlur}
          onChange={(e) => setCaptionConfig({ shadowBlur: parseInt(e.target.value) })}
          className="w-full"
        />
      </Section>

      {/* Position */}
      <Section title="Posição">
        <div className="flex gap-2">
          {([
            { value: "top", icon: <AlignVerticalJustifyStart className="w-4 h-4" />, label: "Topo" },
            { value: "center", icon: <AlignVerticalJustifyCenter className="w-4 h-4" />, label: "Centro" },
            { value: "bottom", icon: <AlignVerticalJustifyEnd className="w-4 h-4" />, label: "Base" },
          ] as const).map((pos) => (
            <button
              key={pos.value}
              onClick={() => setCaptionConfig({ position: pos.value })}
              className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 text-xs transition-all ${
                captionConfig.position === pos.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {pos.icon}
              {pos.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Animation */}
      <Section title="Animação">
        <div className="flex gap-1.5 flex-wrap">
          {ANIMATIONS.map((anim) => (
            <button
              key={anim.value}
              onClick={() => setCaptionConfig({ animation: anim.value })}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                captionConfig.animation === anim.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {anim.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Uppercase */}
      <Section title="Maiúsculas">
        <button
          onClick={() => setCaptionConfig({ uppercase: !captionConfig.uppercase })}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            captionConfig.uppercase
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          {captionConfig.uppercase ? "ABC" : "Abc"}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
        {title}
      </label>
      {children}
    </div>
  );
}
