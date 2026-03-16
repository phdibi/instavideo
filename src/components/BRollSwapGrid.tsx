"use client";

import { useState, useCallback } from "react";
import { Search, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import type { ModeSegment, PexelsVideoResult, PexelsPhotoResult } from "@/types";

interface Props {
  segment: ModeSegment;
}

export default function BRollSwapGrid({ segment }: Props) {
  const { updateModeSegment } = useProjectStore();
  const [customQuery, setCustomQuery] = useState(segment.brollQuery || "");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<PexelsVideoResult[]>(
    segment.pexelsAlternatives || []
  );
  const [photos, setPhotos] = useState<PexelsPhotoResult[]>(
    segment.pexelsPhotoAlternatives || []
  );

  const searchMore = useCallback(async () => {
    if (!customQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search-broll?query=${encodeURIComponent(customQuery.trim())}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data: { videos: PexelsVideoResult[]; photos: PexelsPhotoResult[] } = await res.json();
      setAlternatives(data.videos);
      setPhotos(data.photos || []);
      updateModeSegment(segment.id, {
        pexelsAlternatives: data.videos,
        pexelsPhotoAlternatives: data.photos || [],
        brollQuery: customQuery.trim(),
      });
    } catch (e) {
      console.warn("B-roll search failed:", e);
    } finally {
      setLoading(false);
    }
  }, [customQuery, segment.id, updateModeSegment]);

  const generateWithAI = useCallback(async () => {
    if (!customQuery.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: customQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }
      if (!data.url) {
        throw new Error("Nenhuma imagem retornada");
      }
      setGeneratedImages((prev) => [data.url, ...prev]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar imagem";
      setGenerateError(msg);
      console.warn("AI image generation failed:", e);
    } finally {
      setGenerating(false);
    }
  }, [customQuery]);

  const selectVideo = (video: PexelsVideoResult) => {
    updateModeSegment(segment.id, {
      brollVideoUrl: video.url,
      brollMediaType: "video",
      brollImageUrl: undefined,
    });
  };

  const selectPhoto = (photo: PexelsPhotoResult) => {
    updateModeSegment(segment.id, {
      brollImageUrl: photo.url,
      brollMediaType: "photo",
      brollVideoUrl: undefined,
    });
  };

  const selectGeneratedImage = (url: string) => {
    updateModeSegment(segment.id, {
      brollImageUrl: url,
      brollMediaType: "photo",
      brollVideoUrl: undefined,
    });
  };

  const isVideoActive = (video: PexelsVideoResult) =>
    segment.brollMediaType !== "photo" &&
    segment.brollVideoUrl === video.url;

  const isPhotoActive = (photo: PexelsPhotoResult) =>
    segment.brollMediaType === "photo" &&
    segment.brollImageUrl === photo.url;

  const isGeneratedActive = (url: string) =>
    segment.brollMediaType === "photo" &&
    segment.brollImageUrl === url;

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Trocar B-Roll
      </h3>

      <p className="text-xs text-zinc-500">
        Segmento: {segment.startTime.toFixed(1)}s – {segment.endTime.toFixed(1)}s
      </p>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchMore()}
            placeholder="Buscar ou descrever imagem..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={searchMore}
          disabled={loading}
          className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Buscar
        </button>
      </div>

      {/* Generate with AI button */}
      <button
        onClick={generateWithAI}
        disabled={generating || !customQuery.trim()}
        className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {generating ? "Gerando imagem..." : "Gerar com IA"}
      </button>

      {/* Error message */}
      {generateError && (
        <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          {generateError}
        </p>
      )}

      {/* AI Generated images */}
      {generatedImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">
            Geradas com IA
          </p>
          <div className="grid grid-cols-3 gap-2">
            {generatedImages.map((url) => (
              <div
                key={`ai-${url}`}
                className={`relative rounded-xl overflow-hidden cursor-pointer group transition-all ${
                  isGeneratedActive(url)
                    ? "ring-2 ring-purple-500 ring-offset-2 ring-offset-[#0a0a0a]"
                    : "hover:ring-1 hover:ring-white/30"
                }`}
                onClick={() => selectGeneratedImage(url)}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full aspect-square object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    Usar este
                  </span>
                </div>
                <div className="absolute top-1 left-1 bg-purple-500/80 rounded px-1.5 py-0.5">
                  <span className="text-[10px] text-white font-medium">IA</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Combined grid: videos + photos */}
      <div className="grid grid-cols-3 gap-2">
        {alternatives.map((video) => (
          <div
            key={`v-${video.id}`}
            className={`relative rounded-xl overflow-hidden cursor-pointer group transition-all ${
              isVideoActive(video)
                ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0a0a0a]"
                : "hover:ring-1 hover:ring-white/30"
            }`}
            onClick={() => selectVideo(video)}
          >
            <img
              src={video.thumbnail}
              alt=""
              className="w-full aspect-square object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                Usar este
              </span>
            </div>
            <div className="absolute top-1 left-1 bg-blue-500/80 rounded px-1.5 py-0.5">
              <span className="text-[10px] text-white font-medium">Video</span>
            </div>
            <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1.5 py-0.5">
              <span className="text-[10px] text-white">
                {video.duration}s
              </span>
            </div>
          </div>
        ))}
        {photos.map((photo) => (
          <div
            key={`p-${photo.id}`}
            className={`relative rounded-xl overflow-hidden cursor-pointer group transition-all ${
              isPhotoActive(photo)
                ? "ring-2 ring-green-500 ring-offset-2 ring-offset-[#0a0a0a]"
                : "hover:ring-1 hover:ring-white/30"
            }`}
            onClick={() => selectPhoto(photo)}
          >
            <img
              src={photo.thumbnail}
              alt=""
              className="w-full aspect-square object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                Usar este
              </span>
            </div>
            <div className="absolute top-1 left-1 bg-green-500/80 rounded px-1.5 py-0.5">
              <span className="text-[10px] text-white font-medium">Foto</span>
            </div>
          </div>
        ))}
      </div>

      {alternatives.length === 0 && photos.length === 0 && generatedImages.length === 0 && !loading && (
        <p className="text-center text-sm text-zinc-500 py-4">
          Busque vídeos e fotos para ver alternativas
        </p>
      )}
    </div>
  );
}
