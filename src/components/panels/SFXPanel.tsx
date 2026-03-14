"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { SFX_PLAY_MAP } from "@/lib/sfx";
import { Volume2, Play, Trash2 } from "lucide-react";
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
  const { sfxConfig, setSFXConfig, sfxMarkers, selectedItem, updateSFXMarker, deleteSFXMarker, setSelectedItem } = useProjectStore();

  const selectedMarker = selectedItem?.type === "sfx"
    ? sfxMarkers.find((m) => m.id === selectedItem.id)
    : null;

  return (
    <div className="space-y-5 overflow-y-auto max-h-full">
      {/* Selected marker editing */}
      {selectedMarker && (
        <div className="px-4 pt-4 space-y-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              Marcador SFX
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
          <p className="text-[10px] text-[var(--text-secondary)]">
            Tempo: {selectedMarker.time.toFixed(2)}s
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
        </div>
      )}

      {/* Profile selector */}
      <div className="px-4 pt-4 space-y-2">
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

      {/* Volume slider */}
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

      {/* Preview all sounds */}
      {sfxConfig.profile !== "none" && (
        <div className="px-4 pb-4 space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Pré-visualizar Sons
          </label>
          <div className="space-y-1">
            {ALL_SOUNDS.map((s) => (
              <button
                key={s.key}
                onClick={() => SFX_PLAY_MAP[s.key](sfxConfig.masterVolume)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors text-left"
              >
                <Play className="w-3.5 h-3.5 text-[var(--accent-light)] flex-shrink-0" />
                <span className="text-xs text-[var(--foreground)]">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
