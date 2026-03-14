"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { playWhoosh, playWhooshOut, playImpact, playRise, playSlide, playPop } from "@/lib/sfx";
import { Volume2, Play } from "lucide-react";
import type { SFXProfile } from "@/types";

const PROFILES: { value: SFXProfile; label: string; desc: string }[] = [
  { value: "cinematic", label: "Cinematográfico", desc: "Sons ricos e dramáticos" },
  { value: "corporate", label: "Corporativo", desc: "Sons sutis e profissionais" },
  { value: "minimal", label: "Minimal", desc: "Apenas transições essenciais" },
  { value: "none", label: "Sem sons", desc: "Desabilita todos os SFX" },
];

const SOUNDS = [
  { key: "whoosh", label: "Whoosh (entrada B-Roll)", play: (v: number) => playWhoosh(v) },
  { key: "whooshOut", label: "Whoosh (saída B-Roll)", play: (v: number) => playWhooshOut(v) },
  { key: "impact", label: "Impacto (tipografia)", play: (v: number) => playImpact(v) },
  { key: "rise", label: "Rise (saída tipografia)", play: (v: number) => playRise(v) },
  { key: "slide", label: "Slide (split-screen)", play: (v: number) => playSlide(v) },
  { key: "pop", label: "Pop (elementos)", play: (v: number) => playPop(v) },
];

export default function SFXPanel() {
  const { sfxConfig, setSFXConfig } = useProjectStore();

  return (
    <div className="space-y-5 overflow-y-auto max-h-full">
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

      {/* Preview sounds */}
      {sfxConfig.profile !== "none" && (
        <div className="px-4 pb-4 space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Pré-visualizar Sons
          </label>
          <div className="space-y-1">
            {SOUNDS.map((s) => (
              <button
                key={s.key}
                onClick={() => s.play(sfxConfig.masterVolume)}
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
