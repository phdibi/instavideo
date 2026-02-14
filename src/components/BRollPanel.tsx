"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Trash2,
  RefreshCw,
  Download,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";

export default function BRollPanel() {
  const { bRollImages, updateBRollImage, deleteBRollImage, setCurrentTime } =
    useProjectStore();
  const [generating, setGenerating] = useState<string | null>(null);

  const generateImage = async (id: string, prompt: string) => {
    setGenerating(id);
    try {
      const res = await fetch("/api/generate-broll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      const data = await res.json();
      updateBRollImage(id, { url: data.imageUrl });
    } catch (error) {
      console.error("B-roll generation error:", error);
      alert(
        "Erro ao gerar B-roll: " +
          (error instanceof Error ? error.message : "Erro desconhecido")
      );
    } finally {
      setGenerating(null);
    }
  };

  const generateAll = async () => {
    for (const img of bRollImages) {
      if (!img.url) {
        await generateImage(img.id, img.prompt);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-[var(--accent-light)]" />
          B-Roll ({bRollImages.length})
        </h3>
        {bRollImages.some((b) => !b.url) && (
          <button
            onClick={generateAll}
            disabled={generating !== null}
            className="text-xs px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {generating ? "Gerando..." : "Gerar Todas"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {bRollImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] text-sm p-4">
            <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
            <p>Nenhum B-roll sugerido</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {bRollImages.map((img) => (
              <div
                key={img.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
              >
                {/* Image or placeholder */}
                <div className="relative aspect-video bg-[var(--background)]">
                  {img.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.url}
                      alt={img.prompt}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
                      {generating === img.id ? (
                        <>
                          <Loader2 className="w-8 h-8 animate-spin mb-2" />
                          <span className="text-xs">Gerando com Imagen 3...</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-xs">Clique para gerar</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  <button
                    onClick={() => setCurrentTime(img.startTime)}
                    className="text-xs font-mono text-[var(--accent-light)] hover:underline"
                  >
                    {formatTime(img.startTime)} - {formatTime(img.endTime)}
                  </button>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                    {img.prompt}
                  </p>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    <select
                      value={img.animation}
                      onChange={(e) =>
                        updateBRollImage(img.id, {
                          animation: e.target.value as "fade" | "slide" | "zoom" | "ken-burns",
                        })
                      }
                      className="flex-1 p-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg"
                    >
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="zoom">Zoom</option>
                      <option value="ken-burns">Ken Burns</option>
                    </select>

                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-[var(--text-secondary)]">
                        Op:
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={img.opacity}
                        onChange={(e) =>
                          updateBRollImage(img.id, {
                            opacity: parseFloat(e.target.value),
                          })
                        }
                        className="w-16"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!img.url ? (
                      <button
                        onClick={() => generateImage(img.id, img.prompt)}
                        disabled={generating !== null}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                      >
                        <Download className="w-3 h-3" />
                        Gerar
                      </button>
                    ) : (
                      <button
                        onClick={() => generateImage(img.id, img.prompt)}
                        disabled={generating !== null}
                        className="flex items-center gap-1 py-1.5 px-2 text-xs rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regen
                      </button>
                    )}
                    <button
                      onClick={() => deleteBRollImage(img.id)}
                      className="p-1.5 rounded-lg text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
