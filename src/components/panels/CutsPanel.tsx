"use client";

import { useProjectStore } from "@/store/useProjectStore";
import type { VideoMode } from "@/types";
import { Trash2, Play } from "lucide-react";

const MODE_COLORS: Record<VideoMode, { bg: string; text: string; label: string }> = {
  presenter: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Apresentador" },
  broll: { bg: "bg-orange-500/20", text: "text-orange-400", label: "B-Roll" },
  typography: { bg: "bg-purple-500/20", text: "text-purple-400", label: "Tipografia" },
};

const MODE_CYCLE: VideoMode[] = ["presenter", "broll", "typography"];

export default function CutsPanel() {
  const {
    modeSegments,
    selectedItem,
    setSelectedItem,
    setCurrentTime,
    updateModeSegment,
    setModeSegments,
  } = useProjectStore();

  const sorted = [...modeSegments].sort((a, b) => a.startTime - b.startTime);

  const handleSeek = (startTime: number, segId: string) => {
    setCurrentTime(startTime);
    setSelectedItem({ type: "segment", id: segId });
  };

  const handleDelete = (id: string) => {
    if (modeSegments.length <= 1) return;
    setModeSegments(modeSegments.filter((s) => s.id !== id));
    if (selectedItem?.id === id) setSelectedItem(null);
  };

  const handleCycleMode = (id: string) => {
    const seg = modeSegments.find((s) => s.id === id);
    if (!seg) return;
    const currentIdx = MODE_CYCLE.indexOf(seg.mode);
    const nextMode = MODE_CYCLE[(currentIdx + 1) % MODE_CYCLE.length];
    // Set required fields when cycling modes
    const updates: Partial<typeof seg> = { mode: nextMode };
    if (nextMode === "broll") {
      updates.brollQuery = seg.brollQuery || "";
      updates.brollEffect = "zoom-in";
      updates.brollEffectIntensity = 1.0;
      updates.brollLayout = seg.brollLayout || "fullscreen";
    } else if (nextMode === "typography") {
      updates.typographyText = seg.typographyText || seg.transcriptText || "";
      updates.typographyBackground = "#F5F0E8";
    }
    updateModeSegment(id, updates);
  };

  return (
    <div className="p-4 space-y-3 overflow-y-auto max-h-full">
      <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
        Segmentos ({sorted.length})
      </label>

      <div className="space-y-1.5">
        {sorted.map((seg, idx) => {
          const colors = MODE_COLORS[seg.mode];
          const isSelected = selectedItem?.id === seg.id;
          const duration = (seg.endTime - seg.startTime).toFixed(1);

          return (
            <div
              key={seg.id}
              className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all ${
                isSelected
                  ? "bg-[var(--accent)]/10 border border-[var(--accent)]/40"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
              onClick={() => handleSeek(seg.startTime, seg.id)}
            >
              {/* Index */}
              <span className="text-[10px] text-[var(--text-secondary)] w-5 text-center font-mono">
                {idx + 1}
              </span>

              {/* Mode badge */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCycleMode(seg.id);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
                title="Clique para mudar o tipo"
              >
                {colors.label}
              </button>

              {/* Time info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--foreground)] truncate">
                  {seg.startTime.toFixed(1)}s – {seg.endTime.toFixed(1)}s
                  <span className="text-[var(--text-secondary)] ml-1">({duration}s)</span>
                </p>
                {seg.mode === "broll" && seg.brollQuery && (
                  <p className="text-[10px] text-[var(--text-secondary)] truncate">
                    {seg.brollQuery}
                  </p>
                )}
                {seg.mode === "typography" && seg.typographyText && (
                  <p className="text-[10px] text-[var(--text-secondary)] truncate">
                    {seg.typographyText}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(seg.startTime, seg.id);
                  }}
                  className="p-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                  title="Ir para o início"
                >
                  <Play className="w-3 h-3 text-[var(--text-secondary)]" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(seg.id);
                  }}
                  className="p-1 rounded-md hover:bg-red-500/20 transition-colors"
                  title="Deletar segmento"
                  disabled={modeSegments.length <= 1}
                >
                  <Trash2 className="w-3 h-3 text-[var(--text-secondary)]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
