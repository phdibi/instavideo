"use client";

import { useRef, useMemo } from "react";
import { useProjectStore } from "@/store/useProjectStore";

const TRACK_HEIGHT = 28;
const HEADER_WIDTH = 80;

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    videoDuration,
    currentTime,
    captions,
    effects,
    bRollImages,
    setCurrentTime,
  } = useProjectStore();

  const pxPerSecond = useMemo(() => {
    if (!videoDuration) return 20;
    return Math.max(20, 800 / videoDuration);
  }, [videoDuration]);

  const timelineWidth = videoDuration * pxPerSecond;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - HEADER_WIDTH;
    if (x < 0) return;
    const time = x / pxPerSecond;
    setCurrentTime(Math.min(Math.max(0, time), videoDuration));
  };

  // Time markers
  const markers = useMemo(() => {
    const interval = videoDuration > 60 ? 10 : videoDuration > 20 ? 5 : videoDuration > 10 ? 2 : 1;
    const result: number[] = [];
    for (let t = 0; t <= videoDuration; t += interval) {
      result.push(t);
    }
    return result;
  }, [videoDuration]);

  return (
    <div className="h-full bg-[var(--surface)] border-t border-[var(--border)] flex flex-col">
      {/* Timeline header */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={containerRef}>
        <div
          className="relative min-w-full"
          style={{ width: timelineWidth + HEADER_WIDTH }}
          onClick={handleClick}
        >
          {/* Time ruler */}
          <div className="h-6 flex items-end border-b border-[var(--border)]">
            <div className="shrink-0" style={{ width: HEADER_WIDTH }} />
            <div className="relative h-full" style={{ width: timelineWidth }}>
              {markers.map((t) => (
                <div
                  key={t}
                  className="absolute bottom-0 text-[9px] text-[var(--text-secondary)] font-mono"
                  style={{ left: t * pxPerSecond }}
                >
                  <div className="h-2 w-px bg-[var(--border)] mb-0.5" />
                  {t > 0 && <span className="ml-0.5">{t}s</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Captions track */}
          <div className="flex items-center" style={{ height: TRACK_HEIGHT }}>
            <div
              className="shrink-0 px-2 text-[10px] text-[var(--text-secondary)] uppercase tracking-wide flex items-center h-full border-r border-[var(--border)]"
              style={{ width: HEADER_WIDTH }}
            >
              Legendas
            </div>
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
              {captions.map((c) => (
                <div
                  key={c.id}
                  className="absolute top-1 h-5 rounded-sm bg-[var(--accent)]/40 border border-[var(--accent)]/60 text-[8px] text-white px-1 truncate flex items-center cursor-pointer hover:bg-[var(--accent)]/60 transition-colors"
                  style={{
                    left: c.startTime * pxPerSecond,
                    width: Math.max(
                      (c.endTime - c.startTime) * pxPerSecond,
                      4
                    ),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentTime(c.startTime);
                  }}
                  title={c.text}
                >
                  {(c.endTime - c.startTime) * pxPerSecond > 30 && c.text}
                </div>
              ))}
            </div>
          </div>

          {/* Effects track */}
          <div
            className="flex items-center border-t border-[var(--border)]/50"
            style={{ height: TRACK_HEIGHT }}
          >
            <div
              className="shrink-0 px-2 text-[10px] text-[var(--text-secondary)] uppercase tracking-wide flex items-center h-full border-r border-[var(--border)]"
              style={{ width: HEADER_WIDTH }}
            >
              Efeitos
            </div>
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
              {effects.map((e) => {
                const color = e.type.startsWith("zoom")
                  ? "bg-blue-500/40 border-blue-500/60"
                  : e.type.startsWith("pan") || e.type === "shake"
                  ? "bg-green-500/40 border-green-500/60"
                  : e.type.startsWith("transition")
                  ? "bg-yellow-500/40 border-yellow-500/60"
                  : "bg-purple-500/40 border-purple-500/60";

                return (
                  <div
                    key={e.id}
                    className={`absolute top-1 h-5 rounded-sm ${color} border text-[8px] text-white px-1 truncate flex items-center cursor-pointer hover:opacity-80 transition-opacity`}
                    style={{
                      left: e.startTime * pxPerSecond,
                      width: Math.max(
                        (e.endTime - e.startTime) * pxPerSecond,
                        4
                      ),
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setCurrentTime(e.startTime);
                    }}
                    title={e.type}
                  >
                    {(e.endTime - e.startTime) * pxPerSecond > 30 && e.type}
                  </div>
                );
              })}
            </div>
          </div>

          {/* B-Roll track */}
          <div
            className="flex items-center border-t border-[var(--border)]/50"
            style={{ height: TRACK_HEIGHT }}
          >
            <div
              className="shrink-0 px-2 text-[10px] text-[var(--text-secondary)] uppercase tracking-wide flex items-center h-full border-r border-[var(--border)]"
              style={{ width: HEADER_WIDTH }}
            >
              B-Roll
            </div>
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
              {bRollImages.map((b) => (
                <div
                  key={b.id}
                  className={`absolute top-1 h-5 rounded-sm border text-[8px] text-white px-1 truncate flex items-center cursor-pointer ${
                    b.url
                      ? "bg-orange-500/40 border-orange-500/60"
                      : "bg-gray-500/30 border-gray-500/50 border-dashed"
                  }`}
                  style={{
                    left: b.startTime * pxPerSecond,
                    width: Math.max(
                      (b.endTime - b.startTime) * pxPerSecond,
                      4
                    ),
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setCurrentTime(b.startTime);
                  }}
                  title={b.prompt}
                >
                  {(b.endTime - b.startTime) * pxPerSecond > 30 &&
                    (b.url ? "B-Roll" : "Pendente")}
                </div>
              ))}
            </div>
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
            style={{ left: HEADER_WIDTH + currentTime * pxPerSecond }}
          >
            <div className="w-3 h-3 -ml-1.5 bg-red-500 rounded-b-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
