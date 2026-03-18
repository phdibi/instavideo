"use client";

import { useMemo, useCallback, useState, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { AVAILABLE_FONTS } from "@/lib/fonts";
import type { CaptionConfig } from "@/types";
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  ChevronLeft,
  ChevronRight,
  Scissors,
  Trash2,
  RotateCcw,
  Copy,
  Plus,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";

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
    selectedItems,
    setSelectedItem,
    updatePhraseCaption,
    deletePhraseCaption,
    applyStyleOverrideToAll,
    setCurrentTime,
    currentTime,
    videoDuration,
    addPhraseCaption,
  } = useProjectStore(
    useShallow((s) => ({
      captionConfig: s.captionConfig,
      setCaptionConfig: s.setCaptionConfig,
      phraseCaptions: s.phraseCaptions,
      selectedItem: s.selectedItem,
      selectedItems: s.selectedItems,
      setSelectedItem: s.setSelectedItem,
      updatePhraseCaption: s.updatePhraseCaption,
      deletePhraseCaption: s.deletePhraseCaption,
      applyStyleOverrideToAll: s.applyStyleOverrideToAll,
      setCurrentTime: s.setCurrentTime,
      currentTime: s.currentTime,
      videoDuration: s.videoDuration,
      addPhraseCaption: s.addPhraseCaption,
    }))
  );

  // Get selected phrases (multi-select aware)
  const selectedPhrases = useMemo(() => {
    return selectedItems
      .filter((i) => i.type === "phrase")
      .map((i) => phraseCaptions.find((c) => c.id === i.id))
      .filter(Boolean) as typeof phraseCaptions;
  }, [selectedItems, phraseCaptions]);

  const hasSelection = selectedPhrases.length > 0;

  // Effective config: merge global + override of selected phrase
  const effectiveConfig = useMemo(() => {
    if (selectedPhrases.length === 1 && selectedPhrases[0]?.styleOverride) {
      return { ...captionConfig, ...selectedPhrases[0].styleOverride };
    }
    return captionConfig;
  }, [captionConfig, selectedPhrases]);

  // Toggle: apply to all or only selected (resets when selection changes)
  const [applyToAll, setApplyToAll] = useState(false);

  // Reset applyToAll when selection changes
  const selectionKey = selectedPhrases.map((p) => p.id).join(",");
  const prevSelectionKeyRef = useRef(selectionKey);
  if (prevSelectionKeyRef.current !== selectionKey) {
    prevSelectionKeyRef.current = selectionKey;
    if (applyToAll) setApplyToAll(false);
  }

  // Handle config change: respects applyToAll toggle
  const handleConfigChange = useCallback((update: Partial<CaptionConfig>) => {
    if (hasSelection && !applyToAll) {
      for (const phrase of selectedPhrases) {
        updatePhraseCaption(phrase.id, {
          styleOverride: { ...phrase.styleOverride, ...update },
        });
      }
    } else {
      setCaptionConfig(update);
    }
  }, [hasSelection, applyToAll, selectedPhrases, updatePhraseCaption, setCaptionConfig]);

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

  const handleAddCaption = useCallback(() => {
    const id = uuidv4();
    const endTime = Math.min(currentTime + 1, videoDuration);
    addPhraseCaption({ id, startTime: currentTime, endTime, text: "texto" });
    setSelectedItem({ type: "phrase", id });
  }, [currentTime, videoDuration, addPhraseCaption, setSelectedItem]);

  const handleSplit = useCallback(() => {
    if (!selectedPhrase) return;
    const { startTime, endTime, text, styleOverride, stanzaId, isEmphasis } = selectedPhrase;
    const words = text.split(" ");
    const duration = endTime - startTime;
    if (words.length >= 2) {
      const midIdx = Math.ceil(words.length / 2);
      const firstText = words.slice(0, midIdx).join(" ");
      const secondText = words.slice(midIdx).join(" ");
      const splitTime = startTime + duration * (midIdx / words.length);
      updatePhraseCaption(selectedPhrase.id, { text: firstText, endTime: splitTime });
      const newId = uuidv4();
      addPhraseCaption({ id: newId, startTime: splitTime, endTime, text: secondText, styleOverride, stanzaId, isEmphasis });
      setSelectedItem({ type: "phrase", id: newId });
    } else {
      const midTime = startTime + duration / 2;
      updatePhraseCaption(selectedPhrase.id, { endTime: midTime });
      const newId = uuidv4();
      addPhraseCaption({ id: newId, startTime: midTime, endTime, text, styleOverride, stanzaId, isEmphasis });
      setSelectedItem({ type: "phrase", id: newId });
    }
  }, [selectedPhrase, updatePhraseCaption, addPhraseCaption, setSelectedItem]);

  return (
    <div className="p-4 space-y-5 overflow-y-auto max-h-full">
      {/* ═══ Add caption button ═══ */}
      <button
        onClick={handleAddCaption}
        className="w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-[var(--accent)]/15 text-[var(--accent-light)] hover:bg-[var(--accent)]/25 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Adicionar legenda na posição atual
      </button>

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

            {/* Editable text */}
            <input
              type="text"
              value={selectedPhrase.text}
              onChange={(e) => updatePhraseCaption(selectedPhrase.id, { text: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-[var(--border)] rounded-lg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              placeholder="Editar texto..."
            />

            {/* Words preview */}
            <div className="flex flex-wrap gap-1.5">
              {selectedPhrase.text.split(" ").map((word, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-white/10 rounded-md text-xs font-medium"
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

            {/* Split button */}
            <button
              onClick={handleSplit}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all"
              title="Dividir legenda ao meio"
            >
              <Scissors className="w-3 h-3" />
              Dividir
            </button>

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

      {/* ═══ Selection Banner ═══ */}
      {hasSelection && (
        <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--accent-light)]">
            Editando {selectedPhrases.length} legenda{selectedPhrases.length > 1 ? "s" : ""} selecionada{selectedPhrases.length > 1 ? "s" : ""}
          </p>
          {/* Apply to all toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setApplyToAll(!applyToAll)}
              className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-all ${
                applyToAll
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)]"
              }`}
            >
              {applyToAll ? "Aplicando a todas" : "Apenas selecionada"}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (selectedPhrases[0]?.styleOverride) {
                  applyStyleOverrideToAll(selectedPhrases[0].styleOverride);
                }
              }}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-all"
            >
              <Copy className="w-3 h-3" />
              Aplicar a todos
            </button>
            <button
              onClick={() => {
                for (const phrase of selectedPhrases) {
                  updatePhraseCaption(phrase.id, { styleOverride: undefined });
                }
              }}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              Resetar estilo
            </button>
          </div>
        </div>
      )}

      {/* Presets */}
      <Section title="Presets">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handleConfigChange(preset.config)}
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
              onClick={() => handleConfigChange({ fontFamily: font.name })}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                effectiveConfig.fontFamily === font.name
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
      <Section title={`Tamanho: ${effectiveConfig.fontSize}px`}>
        <input
          type="range"
          min={24}
          max={72}
          step={1}
          value={effectiveConfig.fontSize}
          onChange={(e) => handleConfigChange({ fontSize: parseInt(e.target.value) })}
          className="w-full"
        />
      </Section>

      {/* Font Weight */}
      <Section title="Peso">
        <div className="flex gap-1.5">
          {WEIGHTS.map((w) => (
            <button
              key={w}
              onClick={() => handleConfigChange({ fontWeight: w })}
              className={`flex-1 py-1.5 rounded-lg text-xs transition-all ${
                effectiveConfig.fontWeight === w
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
              onClick={() => handleConfigChange({ color })}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                effectiveConfig.color === color
                  ? "border-[var(--accent)] scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            type="text"
            value={effectiveConfig.color}
            onChange={(e) => handleConfigChange({ color: e.target.value })}
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
              onClick={() => handleConfigChange({ strokeWidth: effectiveConfig.strokeWidth > 0 ? 0 : 2 })}
              className={`px-3 py-1 rounded-lg text-xs transition-all ${
                effectiveConfig.strokeWidth > 0
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)]"
              }`}
            >
              {effectiveConfig.strokeWidth > 0 ? "ON" : "OFF"}
            </button>
            {effectiveConfig.strokeWidth > 0 && (
              <>
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.5}
                  value={effectiveConfig.strokeWidth}
                  onChange={(e) => handleConfigChange({ strokeWidth: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-[var(--text-secondary)] w-8">{effectiveConfig.strokeWidth}px</span>
              </>
            )}
          </div>
          {effectiveConfig.strokeWidth > 0 && (
            <div className="flex gap-2">
              {["#000000", "#FFFFFF", "#FF0000", "#0000FF"].map((c) => (
                <button
                  key={c}
                  onClick={() => handleConfigChange({ strokeColor: c })}
                  className={`w-6 h-6 rounded-full border-2 ${
                    effectiveConfig.strokeColor === c ? "border-[var(--accent)]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Shadow */}
      <Section title={`Sombra: ${effectiveConfig.shadowBlur}px`}>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={effectiveConfig.shadowBlur}
          onChange={(e) => handleConfigChange({ shadowBlur: parseInt(e.target.value) })}
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
              onClick={() => handleConfigChange({ position: pos.value })}
              className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 text-xs transition-all ${
                effectiveConfig.position === pos.value
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
              onClick={() => handleConfigChange({ animation: anim.value })}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                effectiveConfig.animation === anim.value
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
          onClick={() => handleConfigChange({ uppercase: !effectiveConfig.uppercase })}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            effectiveConfig.uppercase
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          {effectiveConfig.uppercase ? "ABC" : "Abc"}
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
