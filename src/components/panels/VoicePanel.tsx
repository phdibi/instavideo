"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import type { VoiceEnhancePreset } from "@/types";

const PRESETS: { key: VoiceEnhancePreset; label: string; desc: string }[] = [
  { key: "off", label: "Off", desc: "Áudio original" },
  { key: "natural", label: "Natural", desc: "Leve melhoria, mantém naturalidade" },
  { key: "podcast", label: "Podcast", desc: "Voz cheia e clara, estilo podcast" },
  { key: "cinematic", label: "Cinematic", desc: "Grave profundo, tom cinematográfico" },
];

export default function VoicePanel() {
  const { voiceEnhanceConfig, setVoiceEnhanceConfig } = useProjectStore(
    useShallow((s) => ({
      voiceEnhanceConfig: s.voiceEnhanceConfig,
      setVoiceEnhanceConfig: s.setVoiceEnhanceConfig,
    }))
  );

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Aprimorar Voz
      </h3>

      {/* Preset grid */}
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => {
          const isActive = voiceEnhanceConfig.preset === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setVoiceEnhanceConfig({ preset: p.key })}
              className={`px-3 py-2.5 rounded-xl text-left transition-all ${
                isActive
                  ? "bg-blue-500/20 border border-blue-500/30"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{p.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Intensity slider */}
      {voiceEnhanceConfig.preset !== "off" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">Intensidade</span>
            <span className="text-xs font-mono text-[var(--text-secondary)]">
              {Math.round(voiceEnhanceConfig.intensity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(voiceEnhanceConfig.intensity * 100)}
            onChange={(e) =>
              setVoiceEnhanceConfig({ intensity: parseInt(e.target.value) / 100 })
            }
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
