"use client";

import { useCallback, useMemo } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { AVAILABLE_FONTS } from "@/lib/fonts";
import { generatePhraseCaptions } from "@/lib/modes";
import { RefreshCw } from "lucide-react";
import type { StanzaConfig } from "@/types";

const LAYOUTS: { value: StanzaConfig["stanzaLayout"]; label: string }[] = [
  { value: "centered", label: "Centrado" },
  { value: "cascading", label: "Cascata" },
  { value: "inline", label: "Fluido" },
  { value: "diagonal", label: "Diagonal" },
  { value: "scattered", label: "Espalhado" },
];

export default function StanzaPanel() {
  const {
    stanzaConfig,
    setStanzaConfig,
    transcriptionResult,
    phraseCaptions,
    selectedItem,
    updatePhraseCaption,
    setPhraseCaptions,
  } = useProjectStore();

  const regenerateStanzas = useCallback(() => {
    if (!transcriptionResult) return;
    const phrases = generatePhraseCaptions(transcriptionResult, stanzaConfig);
    setPhraseCaptions(phrases);
  }, [transcriptionResult, stanzaConfig, setPhraseCaptions]);

  const selectedPhrase = useMemo(() => {
    if (selectedItem?.type !== "phrase") return null;
    return phraseCaptions.find((c) => c.id === selectedItem.id) || null;
  }, [selectedItem, phraseCaptions]);

  return (
    <div className="p-4 space-y-4">
      {/* Toggle ON/OFF */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">Ativar estrofes</span>
        <button
          onClick={() => {
            const newEnabled = !stanzaConfig.enabled;
            setStanzaConfig({ enabled: newEnabled });
            if (transcriptionResult) {
              const phrases = generatePhraseCaptions(transcriptionResult, { ...stanzaConfig, enabled: newEnabled });
              setPhraseCaptions(phrases);
            }
          }}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            stanzaConfig.enabled
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface)] border border-[var(--border)]"
          }`}
        >
          {stanzaConfig.enabled ? "ON" : "OFF"}
        </button>
      </div>

      {stanzaConfig.enabled && (
        <>
          {/* Layout selector */}
          <Section title="Layout">
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setStanzaConfig({ stanzaLayout: l.value })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    stanzaConfig.stanzaLayout === l.value
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Interval slider */}
          <Section title={`Frequência: ${stanzaConfig.intervalSeconds}s`}>
            <input
              type="range"
              min={2}
              max={10}
              step={0.5}
              value={stanzaConfig.intervalSeconds}
              onChange={(e) => setStanzaConfig({ intervalSeconds: parseFloat(e.target.value) })}
              className="w-full"
            />
          </Section>

          {/* Words per stanza */}
          <Section title={`Palavras por estrofe: ${stanzaConfig.wordsPerStanza}`}>
            <input
              type="range"
              min={3}
              max={6}
              step={1}
              value={stanzaConfig.wordsPerStanza}
              onChange={(e) => setStanzaConfig({ wordsPerStanza: parseInt(e.target.value) })}
              className="w-full"
            />
          </Section>

          {/* Emphasis font size */}
          <Section title={`Tamanho ênfase: ${stanzaConfig.emphasisFontSize}px`}>
            <input
              type="range"
              min={32}
              max={72}
              step={2}
              value={stanzaConfig.emphasisFontSize}
              onChange={(e) => setStanzaConfig({ emphasisFontSize: parseInt(e.target.value) })}
              className="w-full"
            />
          </Section>

          {/* Normal font size */}
          <Section title={`Tamanho normal: ${stanzaConfig.normalFontSize}px`}>
            <input
              type="range"
              min={16}
              max={40}
              step={2}
              value={stanzaConfig.normalFontSize}
              onChange={(e) => setStanzaConfig({ normalFontSize: parseInt(e.target.value) })}
              className="w-full"
            />
          </Section>

          {/* Emphasis font family */}
          <Section title="Fonte ênfase">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {AVAILABLE_FONTS.map((font) => (
                <button
                  key={font.name}
                  onClick={() => setStanzaConfig({ emphasisFontFamily: font.name })}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    stanzaConfig.emphasisFontFamily === font.name
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

          {/* Normal font family */}
          <Section title="Fonte normal">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {AVAILABLE_FONTS.map((font) => (
                <button
                  key={font.name}
                  onClick={() => setStanzaConfig({ normalFontFamily: font.name })}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    stanzaConfig.normalFontFamily === font.name
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

          {/* Regenerate button */}
          <button
            onClick={regenerateStanzas}
            disabled={!transcriptionResult}
            className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)]/50 disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerar estrofes
          </button>

          {/* Per-word emphasis toggle */}
          {selectedPhrase?.stanzaId && (
            <Section title="Palavra selecionada">
              <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                <span className="text-xs font-medium truncate">{selectedPhrase.text}</span>
                <button
                  onClick={() => updatePhraseCaption(selectedPhrase.id, { isEmphasis: !selectedPhrase.isEmphasis })}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedPhrase.isEmphasis
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-hover)] border border-[var(--border)]"
                  }`}
                >
                  {selectedPhrase.isEmphasis ? "Ênfase ON" : "Ênfase OFF"}
                </button>
              </div>
            </Section>
          )}
        </>
      )}
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
