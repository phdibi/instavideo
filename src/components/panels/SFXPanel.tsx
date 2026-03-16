"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { SFX_PLAY_MAP, SFX_LABELS, generateSFXMarkers } from "@/lib/sfx";
import { Volume2, Play, Trash2, Plus, RefreshCw, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type { SFXProfile, SFXSoundType } from "@/types";

const PROFILES: { value: SFXProfile; label: string; desc: string }[] = [
  { value: "cinematic", label: "Cinematográfico", desc: "Sons ricos e dramáticos" },
  { value: "corporate", label: "Corporativo", desc: "Sons sutis e profissionais" },
  { value: "minimal", label: "Minimal", desc: "Apenas transições essenciais" },
  { value: "none", label: "Sem sons", desc: "Desabilita todos os SFX" },
];

const ALL_SOUNDS: { key: SFXSoundType; label: string }[] = [
  { key: "whoosh", label: "Whoosh In" },
  { key: "whoosh-out", label: "Whoosh Out" },
  { key: "impact", label: "Impacto" },
  { key: "rise", label: "Rise" },
  { key: "slide", label: "Slide" },
  { key: "pop", label: "Pop" },
  { key: "swoosh", label: "Swoosh" },
  { key: "ding", label: "Ding" },
  { key: "thud", label: "Thud" },
  { key: "shimmer", label: "Shimmer" },
  { key: "snap", label: "Snap" },
  { key: "reverse-hit", label: "Reverse Hit" },
];

export default function SFXPanel() {
  const {
    sfxConfig,
    setSFXConfig,
    sfxMarkers,
    modeSegments,
    currentTime,
    selectedItem,
    updateSFXMarker,
    deleteSFXMarker,
    addSFXMarker,
    setSFXMarkers,
    setSelectedItem,
    setCurrentTime,
  } = useProjectStore(
    useShallow((s) => ({
      sfxConfig: s.sfxConfig,
      setSFXConfig: s.setSFXConfig,
      sfxMarkers: s.sfxMarkers,
      modeSegments: s.modeSegments,
      currentTime: s.currentTime,
      selectedItem: s.selectedItem,
      updateSFXMarker: s.updateSFXMarker,
      deleteSFXMarker: s.deleteSFXMarker,
      addSFXMarker: s.addSFXMarker,
      setSFXMarkers: s.setSFXMarkers,
      setSelectedItem: s.setSelectedItem,
      setCurrentTime: s.setCurrentTime,
    }))
  );

  const selectedMarker = selectedItem?.type === "sfx"
    ? sfxMarkers.find((m) => m.id === selectedItem.id)
    : null;

  const handleAddAtPlayhead = () => {
    const id = uuidv4();
    addSFXMarker({ id, time: currentTime, soundType: "impact" });
    setSelectedItem({ type: "sfx", id });
  };

  const handleRegenerate = () => {
    const markers = generateSFXMarkers(modeSegments, uuidv4);
    setSFXMarkers(markers);
    setSelectedItem(null);
  };

  const handleClearAll = () => {
    setSFXMarkers([]);
    setSelectedItem(null);
  };

  return (
    <div className="space-y-5 overflow-y-auto max-h-full">
      {/* ── Selected marker editing ── */}
      {selectedMarker && (
        <div className="px-4 pt-4 space-y-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-yellow-400 uppercase tracking-wider">
              Editando Marcador
            </label>
            <button
              onClick={() => {
                deleteSFXMarker(selectedMarker.id);
                setSelectedItem(null);
              }}
              className="p-1.5 rounded-md hover:bg-red-500/20 transition-colors"
              title="Deletar marcador"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>

          {/* SFX navigation */}
          {(() => {
            const sorted = [...sfxMarkers].sort((a, b) => a.time - b.time);
            const idx = sorted.findIndex((m) => m.id === selectedMarker.id);
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
            if (sorted.length <= 1) return null;
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (prev) { setCurrentTime(prev.time); setSelectedItem({ type: "sfx", id: prev.id }); } }}
                  disabled={!prev}
                  className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1 text-xs text-center text-yellow-300 font-medium">
                  Marcador {idx + 1} / {sorted.length}
                </span>
                <button
                  onClick={() => { if (next) { setCurrentTime(next.time); setSelectedItem({ type: "sfx", id: next.id }); } }}
                  disabled={!next}
                  className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()}

          <p className="text-[10px] text-[var(--text-secondary)]">
            Tempo: {selectedMarker.time.toFixed(2)}s — Som: {SFX_LABELS[selectedMarker.soundType]}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {ALL_SOUNDS.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  updateSFXMarker(selectedMarker.id, { soundType: s.key });
                  SFX_PLAY_MAP[s.key](sfxConfig.masterVolume);
                }}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-[10px] transition-all ${
                  selectedMarker.soundType === s.key
                    ? "bg-yellow-500 text-black font-semibold"
                    : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Apply sound type to all markers */}
          {sfxMarkers.length > 1 && (
            <button
              onClick={() => {
                for (const m of sfxMarkers) {
                  if (m.id === selectedMarker.id) continue;
                  updateSFXMarker(m.id, { soundType: selectedMarker.soundType });
                }
              }}
              className="w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Aplicar a todos os Marcadores
            </button>
          )}
        </div>
      )}

      {/* ── Marker List + Actions ── */}
      <div className="px-4 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Marcadores ({sfxMarkers.length})
          </label>
          <div className="flex gap-1">
            <button
              onClick={handleAddAtPlayhead}
              className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
              title="Adicionar marcador na posição atual"
            >
              <Plus className="w-3.5 h-3.5 text-yellow-400" />
            </button>
            <button
              onClick={handleRegenerate}
              className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
              title="Regenerar marcadores das transições"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            </button>
            {sfxMarkers.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-1.5 rounded-md hover:bg-red-500/20 transition-colors"
                title="Remover todos"
              >
                <Trash2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </button>
            )}
          </div>
        </div>

        {sfxMarkers.length === 0 ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-[11px] text-[var(--text-secondary)]">
              Nenhum marcador de som.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleRegenerate}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
              >
                Gerar das transições
              </button>
              <button
                onClick={handleAddAtPlayhead}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Adicionar manual
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sfxMarkers.map((marker) => {
              const isSelected = selectedItem?.type === "sfx" && selectedItem.id === marker.id;
              return (
                <div
                  key={marker.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-yellow-500/15 border border-yellow-500/40"
                      : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                  onClick={() => {
                    setSelectedItem(isSelected ? null : { type: "sfx", id: marker.id });
                    setCurrentTime(marker.time);
                  }}
                >
                  {/* Diamond indicator */}
                  <div className={`w-2.5 h-2.5 rotate-45 flex-shrink-0 ${
                    isSelected ? "bg-yellow-400" : "bg-yellow-500/60"
                  }`} />
                  {/* Time */}
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono w-12">
                    {marker.time.toFixed(1)}s
                  </span>
                  {/* Sound name */}
                  <span className="text-[11px] text-[var(--foreground)] flex-1 truncate">
                    {SFX_LABELS[marker.soundType]}
                  </span>
                  {/* Preview */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      SFX_PLAY_MAP[marker.soundType](sfxConfig.masterVolume);
                    }}
                    className="p-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
                    title="Pré-visualizar"
                  >
                    <Play className="w-3 h-3 text-[var(--accent-light)]" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSFXMarker(marker.id);
                      if (isSelected) setSelectedItem(null);
                    }}
                    className="p-1 rounded hover:bg-red-500/20 transition-colors"
                    title="Deletar"
                  >
                    <Trash2 className="w-3 h-3 text-[var(--text-secondary)]" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Profile selector ── */}
      <div className="px-4 space-y-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Perfil de Sons
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {PROFILES.map((p) => (
            <button
              key={p.value}
              onClick={() => setSFXConfig({ profile: p.value })}
              className={`flex flex-col items-start gap-0.5 py-2.5 px-3 rounded-lg text-left transition-all ${
                sfxConfig.profile === p.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="text-xs font-semibold">{p.label}</span>
              <span className={`text-[10px] ${
                sfxConfig.profile === p.value ? "text-white/70" : "text-[var(--text-secondary)]"
              }`}>
                {p.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Volume slider ── */}
      <div className="px-4 space-y-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-[var(--text-secondary)]" />
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider flex-1">
            Volume: {Math.round(sfxConfig.masterVolume * 100)}%
          </label>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sfxConfig.masterVolume}
          onChange={(e) => setSFXConfig({ masterVolume: parseFloat(e.target.value) })}
          className="w-full"
          disabled={sfxConfig.profile === "none"}
        />
      </div>

      {/* ── Preview all sounds ── */}
      {sfxConfig.profile !== "none" && (
        <div className="px-4 pb-4 space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Pré-visualizar Sons
          </label>
          <div className="grid grid-cols-2 gap-1">
            {ALL_SOUNDS.map((s) => (
              <button
                key={s.key}
                onClick={() => SFX_PLAY_MAP[s.key](sfxConfig.masterVolume)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors text-left"
              >
                <Play className="w-3 h-3 text-[var(--accent-light)] flex-shrink-0" />
                <span className="text-[10px] text-[var(--foreground)]">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
