"use client";

import { useCallback, useMemo, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { AVAILABLE_FONTS } from "@/lib/fonts";
import { generatePhraseCaptions } from "@/lib/modes";
import { formatTime } from "@/lib/formatTime";
import { RefreshCw, ChevronLeft, ChevronRight, Copy, Trash2, Plus, ArrowUpRight } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type { StanzaConfig, PhraseCaption } from "@/types";

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
    addPhraseCaption,
    deletePhraseCaption,
    setPhraseCaptions,
    setCurrentTime,
    setSelectedItem,
  } = useProjectStore(
    useShallow((s) => ({
      stanzaConfig: s.stanzaConfig,
      stanzaStyleOverrides: s.stanzaStyleOverrides,
      setStanzaConfig: s.setStanzaConfig,
      setStanzaOverride: s.setStanzaOverride,
      transcriptionResult: s.transcriptionResult,
      phraseCaptions: s.phraseCaptions,
      selectedItem: s.selectedItem,
      updatePhraseCaption: s.updatePhraseCaption,
      addPhraseCaption: s.addPhraseCaption,
      deletePhraseCaption: s.deletePhraseCaption,
      setPhraseCaptions: s.setPhraseCaptions,
      setCurrentTime: s.setCurrentTime,
      setSelectedItem: s.setSelectedItem,
    }))
  );

  const [applyToAll, setApplyToAll] = useState(false);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

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

  // Words in the selected stanza
  const stanzaWords = useMemo(() => {
    if (!selectedStanzaId) return [];
    return phraseCaptions.filter((c) => c.stanzaId === selectedStanzaId);
  }, [phraseCaptions, selectedStanzaId]);

  const handleRemoveWord = useCallback((wordId: string) => {
    // Read fresh data from store to avoid stale closure issues on rapid clicks
    const current = useProjectStore.getState().phraseCaptions;
    const remaining = current.filter((w) => w.stanzaId === selectedStanzaId && w.id !== wordId);
    if (remaining.length <= 1 && remaining.length > 0) {
      updatePhraseCaption(remaining[0].id, { stanzaId: undefined });
    }
    deletePhraseCaption(wordId);
    if (selectedItem?.id === wordId) {
      setSelectedItem(remaining.length > 0 ? { type: "phrase", id: remaining[0].id } : null);
    }
  }, [selectedStanzaId, deletePhraseCaption, updatePhraseCaption, selectedItem, setSelectedItem]);

  const handleAddWord = useCallback(() => {
    if (!selectedStanzaId || stanzaWords.length === 0) return;
    const lastWord = stanzaWords[stanzaWords.length - 1];
    const newCaption: PhraseCaption = {
      id: uuidv4(),
      stanzaId: selectedStanzaId,
      text: "nova",
      startTime: lastWord.startTime,
      endTime: lastWord.endTime,
      isEmphasis: false,
    };
    addPhraseCaption(newCaption);
    setSelectedItem({ type: "phrase", id: newCaption.id });
    setEditingWordId(newCaption.id);
  }, [selectedStanzaId, stanzaWords, addPhraseCaption, setSelectedItem]);

  // Find adjacent non-stanza phrases for pull buttons
  const sortedCaptions = useMemo(
    () => [...phraseCaptions].sort((a, b) => a.startTime - b.startTime),
    [phraseCaptions]
  );

  const prevNonStanzaPhrase = useMemo(() => {
    if (!selectedStanzaId || stanzaWords.length === 0) return null;
    const stanzaStart = Math.min(...stanzaWords.map((w) => w.startTime));
    for (let i = sortedCaptions.length - 1; i >= 0; i--) {
      const c = sortedCaptions[i];
      if (!c.stanzaId && c.endTime <= stanzaStart + 0.01) return c;
    }
    return null;
  }, [selectedStanzaId, stanzaWords, sortedCaptions]);

  const nextNonStanzaPhrase = useMemo(() => {
    if (!selectedStanzaId || stanzaWords.length === 0) return null;
    const stanzaEnd = Math.max(...stanzaWords.map((w) => w.endTime));
    for (const c of sortedCaptions) {
      if (!c.stanzaId && c.startTime >= stanzaEnd - 0.01) return c;
    }
    return null;
  }, [selectedStanzaId, stanzaWords, sortedCaptions]);

  const handlePullPrev = useCallback(() => {
    if (!prevNonStanzaPhrase || !selectedStanzaId) return;
    const words = prevNonStanzaPhrase.text.split(" ");
    if (words.length <= 1) {
      // Single word → just assign stanzaId
      updatePhraseCaption(prevNonStanzaPhrase.id, { stanzaId: selectedStanzaId });
    } else {
      // Multi-word → split into individual word captions with stanzaId
      const duration = prevNonStanzaPhrase.endTime - prevNonStanzaPhrase.startTime;
      const wordDur = duration / words.length;
      // Update the first word in-place
      updatePhraseCaption(prevNonStanzaPhrase.id, {
        text: words[0],
        endTime: prevNonStanzaPhrase.startTime + wordDur,
        stanzaId: selectedStanzaId,
      });
      // Create new captions for remaining words
      for (let i = 1; i < words.length; i++) {
        addPhraseCaption({
          id: uuidv4(),
          text: words[i],
          startTime: prevNonStanzaPhrase.startTime + wordDur * i,
          endTime: prevNonStanzaPhrase.startTime + wordDur * (i + 1),
          stanzaId: selectedStanzaId,
        });
      }
    }
  }, [prevNonStanzaPhrase, selectedStanzaId, updatePhraseCaption, addPhraseCaption]);

  const handlePullNext = useCallback(() => {
    if (!nextNonStanzaPhrase || !selectedStanzaId) return;
    const words = nextNonStanzaPhrase.text.split(" ");
    if (words.length <= 1) {
      updatePhraseCaption(nextNonStanzaPhrase.id, { stanzaId: selectedStanzaId });
    } else {
      const duration = nextNonStanzaPhrase.endTime - nextNonStanzaPhrase.startTime;
      const wordDur = duration / words.length;
      updatePhraseCaption(nextNonStanzaPhrase.id, {
        text: words[0],
        endTime: nextNonStanzaPhrase.startTime + wordDur,
        stanzaId: selectedStanzaId,
      });
      for (let i = 1; i < words.length; i++) {
        addPhraseCaption({
          id: uuidv4(),
          text: words[i],
          startTime: nextNonStanzaPhrase.startTime + wordDur * i,
          endTime: nextNonStanzaPhrase.startTime + wordDur * (i + 1),
          stanzaId: selectedStanzaId,
        });
      }
    }
  }, [nextNonStanzaPhrase, selectedStanzaId, updatePhraseCaption, addPhraseCaption]);

  const handleEjectWord = useCallback((wordId: string) => {
    const current = useProjectStore.getState().phraseCaptions;
    const remaining = current.filter((w) => w.stanzaId === selectedStanzaId && w.id !== wordId);
    if (remaining.length <= 1 && remaining.length > 0) {
      updatePhraseCaption(remaining[0].id, { stanzaId: undefined });
    }
    updatePhraseCaption(wordId, { stanzaId: undefined });
  }, [selectedStanzaId, updatePhraseCaption]);

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

          {/* Editable word list for selected stanza */}
          {selectedStanzaId && stanzaWords.length > 0 && (
            <Section title="Palavras da estrofe">
              {/* Pull adjacent captions into stanza */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={handlePullPrev}
                  disabled={!prevNonStanzaPhrase}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Puxar legenda anterior para estrofe"
                >
                  <ChevronLeft className="w-3 h-3" />
                  Puxar anterior
                </button>
                <button
                  onClick={handlePullNext}
                  disabled={!nextNonStanzaPhrase}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Puxar legenda seguinte para estrofe"
                >
                  Puxar seguinte
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                {stanzaWords.map((word) => {
                  const isSelected = selectedItem?.id === word.id;
                  const isEditing = editingWordId === word.id;
                  return (
                    <div
                      key={word.id}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${
                        isSelected
                          ? "bg-purple-500/20 border border-purple-500/40"
                          : "bg-[var(--surface)] border border-[var(--border)]"
                      }`}
                      onClick={() => setSelectedItem({ type: "phrase", id: word.id })}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={word.text}
                          autoFocus
                          onChange={(e) => updatePhraseCaption(word.id, { text: e.target.value })}
                          onBlur={() => setEditingWordId(null)}
                          onKeyDown={(e) => { if (e.key === "Enter") setEditingWordId(null); }}
                          className="flex-1 min-w-0 px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--surface)] border border-[var(--accent)] focus:outline-none"
                        />
                      ) : (
                        <span
                          className={`flex-1 min-w-0 truncate text-xs cursor-text ${
                            word.isEmphasis ? "font-bold text-purple-300" : ""
                          }`}
                          onDoubleClick={() => setEditingWordId(word.id)}
                        >
                          {word.text}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updatePhraseCaption(word.id, { isEmphasis: !word.isEmphasis });
                        }}
                        title="Ênfase"
                        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-all ${
                          word.isEmphasis
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-secondary)]"
                        }`}
                      >
                        E
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEjectWord(word.id);
                        }}
                        title="Ejetar para legenda normal"
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWord(word.id);
                        }}
                        title="Remover palavra"
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={handleAddWord}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] bg-[var(--surface)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar palavra
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
