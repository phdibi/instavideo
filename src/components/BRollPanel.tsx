"use client";

import { useState, useEffect, useRef } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Trash2,
  RefreshCw,
  Download,
  Pencil,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";

export default function BRollPanel() {
  const { bRollImages, updateBRollImage, deleteBRollImage, setCurrentTime, selectedItem } =
    useProjectStore();
  const [generating, setGenerating] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-scroll to selected B-roll from timeline
  useEffect(() => {
    if (selectedItem?.type === "broll") {
      requestAnimationFrame(() => {
        const el = itemRefs.current.get(selectedItem.id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  }, [selectedItem]);

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

  const startEditPrompt = (id: string, currentPrompt: string) => {
    setEditingPrompt(id);
    setPromptDraft(currentPrompt);
  };

  const savePrompt = (id: string) => {
    if (promptDraft.trim()) {
      updateBRollImage(id, { prompt: promptDraft.trim() });
    }
    setEditingPrompt(null);
  };

  const saveAndRegenerate = async (id: string) => {
    if (promptDraft.trim()) {
      updateBRollImage(id, { prompt: promptDraft.trim(), url: "" });
      setEditingPrompt(null);
      await generateImage(id, promptDraft.trim());
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
            {bRollImages.map((img) => {
              const isSelected = selectedItem?.type === "broll" && selectedItem.id === img.id;
              const isEditingThis = editingPrompt === img.id;

              return (
                <div
                  key={img.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(img.id, el);
                    else itemRefs.current.delete(img.id);
                  }}
                  className={`bg-[var(--surface)] border rounded-xl overflow-hidden transition-all ${
                    isSelected
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/30 shadow-md shadow-[var(--accent)]/10"
                      : "border-[var(--border)]"
                  }`}
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
                            <span className="text-xs">Gerando com Imagen 4...</span>
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

                    {/* Editable prompt */}
                    {isEditingThis ? (
                      <div className="space-y-2">
                        <textarea
                          value={promptDraft}
                          onChange={(e) => setPromptDraft(e.target.value)}
                          className="w-full p-2 text-xs bg-[var(--background)] border border-[var(--accent)] rounded-lg resize-none focus:outline-none"
                          rows={3}
                          autoFocus
                          placeholder="Descreva a imagem que deseja gerar..."
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => savePrompt(img.id)}
                            className="flex-1 py-1.5 text-xs rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => saveAndRegenerate(img.id)}
                            disabled={generating !== null}
                            className="flex-1 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                          >
                            Salvar e Gerar
                          </button>
                          <button
                            onClick={() => setEditingPrompt(null)}
                            className="py-1.5 px-2 text-xs rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-start gap-1.5 group cursor-pointer"
                        onClick={() => startEditPrompt(img.id, img.prompt)}
                      >
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 flex-1 group-hover:text-[var(--foreground)] transition-colors">
                          {img.prompt}
                        </p>
                        <Pencil className="w-3 h-3 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                      </div>
                    )}

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
                        <>
                          <button
                            onClick={() => generateImage(img.id, img.prompt)}
                            disabled={generating !== null}
                            className="flex items-center gap-1 py-1.5 px-2 text-xs rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Regen
                          </button>
                          <button
                            onClick={() => startEditPrompt(img.id, img.prompt)}
                            className="flex items-center gap-1 py-1.5 px-2 text-xs rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                        </>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
