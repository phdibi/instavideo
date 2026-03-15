"use client";

import { useCallback, useMemo, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { AVAILABLE_FONTS } from "@/lib/fonts";
import { generatePhraseCaptions } from "@/lib/modes";
import { formatTime } from "@/lib/formatTime";
import { RefreshCw, ChevronLeft, ChevronRight, Copy } from "lucide-react";
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
    stanzaStyleOverrides,
    setStanzaConfig,
    setStanzaOverride,
    transcriptionResult,
    phraseCaptions,
    selectedItem,
    updatePhraseCaption,
    setPhraseCaptions,
    setCurrentTime,
    setSelectedItem,
  } = useProjectStore();

  const [applyToAll, setApplyToAll] = useState(false);

  const regenerateStanzas = useCallback(() => {
    if (!transcriptionResult) return;
    const phrases = generatePhraseCaptions(transcriptionResult, stanzaConfig);
    setPhraseCaptions(phrases);
  }, [transcriptionResult, stanzaConfig, setPhraseCaptions]);

  const selectedPhrase = useMemo(() => {
    if (selectedItem?.type !== "phrase") return null;
    return phraseCaptions.find((c) => c.id === selectedItem.id) || null;
  }, [selectedItem, phraseCaptions]);

  // The stanzaId of the selected phrase (if any)
  const selectedStanzaId = selectedPhrase?.stanzaId || null;

  // Group stanza captions by stanzaId for the clickable list
  const stanzaGroups = useMemo(() => {
    const groups: Record<string, typeof phraseCaptions> = {};
    for (const cap of phraseCaptions) {
      if (!cap.stanzaId) continue;
      (groups[cap.stanzaId] ||= []).push(cap);
    }
    return Object.entries(groups).sort(
      ([, a], [, b]) => a[0].startTime - b[0].startTime
    );
  }, [phraseCaptions]);

  // Current stanza index + navigation
  const selectedStanzaIdx = selectedStanzaId
    ? stanzaGroups.findIndex(([id]) => id === selectedStanzaId)
    : -1;
  const prevStanza = selectedStanzaIdx > 0 ? stanzaGroups[selectedStanzaIdx - 1] : null;
  const nextStanza = selectedStanzaIdx >= 0 && selectedStanzaIdx < stanzaGroups.length - 1
    ? stanzaGroups[selectedStanzaIdx + 1] : null;

  const navigateTo = (group: [string, typeof phraseCaptions]) => {
    const caps = group[1];
    setCurrentTime(caps[0].startTime);
    setSelectedItem({ type: "phrase", id: caps[0].id });
  };

  // Effective config for the selected stanza (global + per-stanza override)
  const effectiveConfig = useMemo((): StanzaConfig => {
    if (!selectedStanzaId || applyToAll) return stanzaConfig;
    return { ...stanzaConfig, ...stanzaStyleOverrides[selectedStanzaId] };
  }, [stanzaConfig, stanzaStyleOverrides, selectedStanzaId, applyToAll]);

  // Handle config change: per-stanza or global depending on checkbox
  const handleConfigChange = useCallback((update: Partial<StanzaConfig>) => {
    if (selectedStanzaId && !applyToAll) {
      setStanzaOverride(selectedStanzaId, update);
    } else {
      setStanzaConfig(update);
    }
  }, [selectedStanzaId, applyToAll, setStanzaOverride, setStanzaConfig]);

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
          {/* Clickable stanza list */}
          {stanzaGroups.length > 0 && (
            <Section title="Estrofes">
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {stanzaGroups.map(([stanzaId, caps], idx) => {
                  const words = caps.map((c) => c.text).join(" ");
                  const start = caps[0].startTime;
                  const end = caps[caps.length - 1].endTime;
                  const isActive = selectedStanzaId === stanzaId;
                  const hasOverride = !!stanzaStyleOverrides[stanzaId];
                  return (
                    <button
                      key={stanzaId}
                      onClick={() => navigateTo([stanzaId, caps])}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                        isActive
                          ? "bg-purple-500/20 border border-purple-500/40"
                          : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <span className="font-semibold text-purple-300">Estrofe {idx + 1}</span>
                      {hasOverride && <span className="text-purple-400 ml-1 text-[9px]">*</span>}
                      <span className="text-[var(--text-secondary)] ml-2">{formatTime(start)} – {formatTime(end)}</span>
                      <p className="text-[var(--text-secondary)] truncate mt-0.5">{words}</p>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Navigation + scope toggle (when stanza selected) */}
          {selectedStanzaId && (
            <div className="space-y-2">
              {/* Prev/Next navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => prevStanza && navigateTo(prevStanza)}
                  disabled={!prevStanza}
                  className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1 text-xs text-center text-purple-300 font-medium">
                  Estrofe {selectedStanzaIdx + 1} / {stanzaGroups.length}
                </span>
                <button
                  onClick={() => nextStanza && navigateTo(nextStanza)}
                  disabled={!nextStanza}
                  className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Apply scope toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setApplyToAll(!applyToAll)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    applyToAll
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] border border-[var(--border)]"
                  }`}
                >
                  {applyToAll ? "Editando todas" : "Editando esta estrofe"}
                </button>
                {!applyToAll && stanzaStyleOverrides[selectedStanzaId] && (
                  <button
                    onClick={() => {
                      const all = stanzaGroups.map(([id]) => id);
                      for (const id of all) {
                        if (id === selectedStanzaId) continue;
                        setStanzaOverride(id, stanzaStyleOverrides[selectedStanzaId]);
                      }
                    }}
                    className="py-1.5 px-3 rounded-lg text-[10px] font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Aplicar a todas
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Layout selector */}
          <Section title="Layout">
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => handleConfigChange({ stanzaLayout: l.value })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    effectiveConfig.stanzaLayout === l.value
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Interval slider (always global — affects generation) */}
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

          {/* Words per stanza (always global — affects generation) */}
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
          <Section title={`Tamanho ênfase: ${effectiveConfig.emphasisFontSize}px`}>
            <input
              type="range"
              min={32}
              max={72}
              step={2}
              value={effectiveConfig.emphasisFontSize}
              onChange={(e) => handleConfigChange({ emphasisFontSize: parseInt(e.target.value) })}
              className="w-full"
            />
          </Section>

          {/* Normal font size */}
          <Section title={`Tamanho normal: ${effectiveConfig.normalFontSize}px`}>
            <input
              type="range"
              min={16}
              max={40}
              step={2}
              value={effectiveConfig.normalFontSize}
              onChange={(e) => handleConfigChange({ normalFontSize: parseInt(e.target.value) })}
              className="w-full"
            />
          </Section>

          {/* Emphasis font family */}
          <Section title="Fonte ênfase">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {AVAILABLE_FONTS.map((font) => (
                <button
                  key={font.name}
                  onClick={() => handleConfigChange({ emphasisFontFamily: font.name })}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    effectiveConfig.emphasisFontFamily === font.name
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
                  onClick={() => handleConfigChange({ normalFontFamily: font.name })}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    effectiveConfig.normalFontFamily === font.name
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

          {/* Per-word text edit + emphasis toggle */}
          {selectedPhrase?.stanzaId && (
            <Section title="Palavra selecionada">
              <div className="space-y-2">
                <input
                  type="text"
                  value={selectedPhrase.text}
                  onChange={(e) => updatePhraseCaption(selectedPhrase.id, { text: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-secondary)]">Ênfase</span>
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
