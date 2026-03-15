"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { Trash2, Copy, ChevronLeft, ChevronRight } from "lucide-react";

const ANIMATIONS = [
  { key: "pop-in" as const, label: "Pop In", desc: "Escala 0→1" },
  { key: "fade-up" as const, label: "Fade Up", desc: "Sobe + fade" },
  { key: "typewriter" as const, label: "Typewriter", desc: "Letra a letra" },
  { key: "slide-in" as const, label: "Slide In", desc: "Desliza da esquerda" },
];

export default function TypographyPanel() {
  const {
    modeSegments,
    selectedItem,
    currentTime,
    setSelectedItem,
    updateModeSegment,
    deleteModeSegment,
    setCurrentTime,
  } = useProjectStore();

  const selected =
    selectedItem?.type === "segment"
      ? modeSegments.find((s) => s.id === selectedItem.id && s.mode === "typography")
      : null;

  const handleCreate = () => {
    // Find the presenter segment at current playhead
    const seg = modeSegments.find(
      (s) => s.mode === "presenter" && currentTime >= s.startTime && currentTime < s.endTime
    );
    if (!seg) return;

    // Convert presenter to typography
    updateModeSegment(seg.id, {
      mode: "typography",
      typographyText: seg.transcriptText || "Seu texto aqui",
      typographyBackground: "#F5F0E8",
      typographyAnimation: "pop-in",
      typographyStagger: 80,
    });
    setSelectedItem({ type: "segment", id: seg.id });
  };

  if (!selected) {
    // Find all typography segments for a list
    const typoSegments = modeSegments.filter((s) => s.mode === "typography");

    return (
      <div className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Tipografia
        </h3>

        {typoSegments.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">
            Nenhum segmento de tipografia. Posicione o playhead sobre um
            trecho de apresentador e clique abaixo.
          </p>
        ) : (
          <div className="space-y-1.5">
            {typoSegments.map((seg) => (
              <button
                key={seg.id}
                className="w-full text-left p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => {
                  setCurrentTime(seg.startTime);
                  setSelectedItem({ type: "segment", id: seg.id });
                }}
              >
                <span className="text-xs text-purple-400 font-medium">
                  {seg.startTime.toFixed(1)}s – {seg.endTime.toFixed(1)}s
                </span>
                <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
                  {seg.typographyText || "—"}
                </p>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleCreate}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
        >
          Criar Tipografia
        </button>
      </div>
    );
  }

  const anim = selected.typographyAnimation || "pop-in";
  const stagger = selected.typographyStagger ?? 80;
  const bg = selected.typographyBackground || "#F5F0E8";

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Editar Tipografia
      </h3>

      {/* Typography navigation */}
      {(() => {
        const typoSegments = modeSegments.filter((s) => s.mode === "typography").sort((a, b) => a.startTime - b.startTime);
        const idx = typoSegments.findIndex((s) => s.id === selected.id);
        const prev = idx > 0 ? typoSegments[idx - 1] : null;
        const next = idx < typoSegments.length - 1 ? typoSegments[idx + 1] : null;
        if (typoSegments.length <= 1) return null;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (prev) { setCurrentTime(prev.startTime); setSelectedItem({ type: "segment", id: prev.id }); } }}
              disabled={!prev}
              className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="flex-1 text-xs text-center text-purple-300 font-medium">
              Tipografia {idx + 1} / {typoSegments.length}
            </span>
            <button
              onClick={() => { if (next) { setCurrentTime(next.startTime); setSelectedItem({ type: "segment", id: next.id }); } }}
              disabled={!next}
              className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      <p className="text-xs text-zinc-500">
        {selected.startTime.toFixed(1)}s – {selected.endTime.toFixed(1)}s
      </p>

      {/* Text */}
      <div className="space-y-1">
        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
          Texto
        </label>
        <textarea
          value={selected.typographyText || ""}
          onChange={(e) =>
            updateModeSegment(selected.id, { typographyText: e.target.value })
          }
          rows={3}
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
          placeholder="Texto da tipografia..."
        />
      </div>

      {/* Background toggle */}
      <div className="space-y-1">
        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
          Background
        </label>
        <div className="flex gap-2">
          <button
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              bg === "#F5F0E8"
                ? "bg-[#F5F0E8] text-[#0a0a0a] ring-2 ring-purple-500"
                : "bg-[#F5F0E8]/20 text-[var(--text-secondary)]"
            }`}
            onClick={() => updateModeSegment(selected.id, { typographyBackground: "#F5F0E8" })}
          >
            Claro
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              bg === "#0a0a0a"
                ? "bg-[#0a0a0a] text-[#F5F0E8] ring-2 ring-purple-500"
                : "bg-[#0a0a0a]/40 text-[var(--text-secondary)]"
            }`}
            onClick={() => updateModeSegment(selected.id, { typographyBackground: "#0a0a0a" })}
          >
            Escuro
          </button>
        </div>
      </div>

      {/* Animation grid */}
      <div className="space-y-1">
        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
          Animacao
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ANIMATIONS.map((a) => (
            <button
              key={a.key}
              className={`p-2.5 rounded-xl text-left transition-all ${
                anim === a.key
                  ? "bg-purple-500/20 border border-purple-500/40"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
              onClick={() => updateModeSegment(selected.id, { typographyAnimation: a.key })}
            >
              <span className="text-xs font-medium text-[var(--foreground)]">{a.label}</span>
              <p className="text-[9px] text-[var(--text-secondary)] mt-0.5">{a.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Stagger slider */}
      <div className="space-y-1">
        <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
          Velocidade ({stagger}ms)
        </label>
        <input
          type="range"
          min={40}
          max={200}
          step={10}
          value={stagger}
          onChange={(e) =>
            updateModeSegment(selected.id, { typographyStagger: Number(e.target.value) })
          }
          className="w-full"
        />
        <div className="flex justify-between text-[9px] text-[var(--text-secondary)]">
          <span>Rapido</span>
          <span>Lento</span>
        </div>
      </div>

      {/* Apply to all typography segments */}
      {(() => {
        const typoSegments = modeSegments.filter((s) => s.mode === "typography");
        if (typoSegments.length <= 1) return null;
        return (
          <button
            onClick={() => {
              for (const seg of typoSegments) {
                if (seg.id === selected.id) continue;
                updateModeSegment(seg.id, {
                  typographyBackground: bg,
                  typographyAnimation: anim,
                  typographyStagger: stagger,
                });
              }
            }}
            className="w-full py-2 rounded-xl text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" />
            Aplicar a todas as Tipografias
          </button>
        );
      })()}

      {/* Delete */}
      <button
        onClick={() => {
          deleteModeSegment(selected.id);
          setSelectedItem(null);
        }}
        className="w-full py-2 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Deletar segmento
      </button>
    </div>
  );
}
