"use client";

import { Music, Play, Pause, Volume2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { musicTracks } from "@/lib/musicLibrary";
import { useRef, useState } from "react";

export default function MusicPanel() {
  const { selectedMusicTrack, musicConfig, setSelectedMusicTrack, setMusicConfig } =
    useProjectStore(
      useShallow((s) => ({
        selectedMusicTrack: s.selectedMusicTrack,
        musicConfig: s.musicConfig,
        setSelectedMusicTrack: s.setSelectedMusicTrack,
        setMusicConfig: s.setMusicConfig,
      }))
    );

  const [previewTrack, setPreviewTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = (trackId: string, file: string) => {
    if (previewTrack === trackId) {
      audioRef.current?.pause();
      setPreviewTrack(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(file);
    audio.volume = 0.3;
    audio.play().catch(() => {});
    audio.onended = () => setPreviewTrack(null);
    audioRef.current = audio;
    setPreviewTrack(trackId);
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Música de Fundo
      </h3>

      {/* Track list */}
      <div className="space-y-2">
        {musicTracks.map((track) => {
          const isSelected = selectedMusicTrack === track.id;
          const isPreviewing = previewTrack === track.id;

          return (
            <div
              key={track.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                isSelected
                  ? "bg-blue-500/20 border border-blue-500/30"
                  : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
              onClick={() =>
                setSelectedMusicTrack(isSelected ? null : track.id)
              }
            >
              <Music className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
              <span className="text-sm flex-1">{track.name}</span>

              {/* Preview button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview(track.id, track.file);
                }}
                className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                {isPreviewing ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3 ml-0.5" />
                )}
              </button>
            </div>
          );
        })}

        {/* No music option */}
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
            !selectedMusicTrack
              ? "bg-zinc-500/20 border border-zinc-500/30"
              : "bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)]"
          }`}
          onClick={() => setSelectedMusicTrack(null)}
        >
          <span className="text-sm text-[var(--text-secondary)]">
            Sem música
          </span>
        </div>
      </div>

      {/* Volume control */}
      {selectedMusicTrack && (
        <div className="space-y-2 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Volume base: {Math.round(musicConfig.baseVolume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(musicConfig.baseVolume * 100)}
            onChange={(e) =>
              setMusicConfig({ baseVolume: parseInt(e.target.value) / 100 })
            }
            className="w-full"
          />
          <p className="text-xs text-zinc-500">
            Volume reduz automaticamente durante fala (ducking)
          </p>
        </div>
      )}
    </div>
  );
}
