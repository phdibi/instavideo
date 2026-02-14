"use client";

import { useRef, useMemo, useCallback } from "react";
import { useProjectStore } from "@/store/useProjectStore";

const TRACK_HEIGHT = 32;
const HEADER_WIDTH = 72;

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
    if (!videoDuration) return 40;
    return Math.max(40, 900 / videoDuration);
  }, [videoDuration]);

  const timelineWidth = videoDuration * pxPerSecond;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      const scrollLeft = container ? container.scrollLeft : 0;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_WIDTH + scrollLeft;
      if (x < 0) return;
      const time = x / pxPerSecond;
      setCurrentTime(Math.min(Math.max(0, time), videoDuration));
    },
    [pxPerSecond, setCurrentTime, videoDuration]
  );

  // Time markers
  const markers = useMemo(() => {
    const interval =
      videoDuration > 60
        ? 10
        : videoDuration > 20
        ? 5
        : videoDuration > 10
        ? 2
        : 1;
    const result: number[] = [];
    for (let t = 0; t <= videoDuration; t += interval) {
      result.push(t);
    }
    return result;
  }, [videoDuration]);

  const getEffectColor = (type: string) => {
    if (type.startsWith("zoom"))
      return "bg-blue-500/50 border-blue-400/70 text-blue-200";
    if (type.startsWith("pan") || type === "shake")
      return "bg-green-500/50 border-green-400/70 text-green-200";
    if (type.startsWith("transition"))
      return "bg-yellow-500/50 border-yellow-400/70 text-yellow-200";
    return "bg-purple-500/50 border-purple-400/70 text-purple-200";
  };

  return (
    <div className="h-full bg-[var(--surface)] border-t border-[var(--border)] flex flex-col select-none">
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden"
        ref={containerRef}
      >
        <div
          className="relative min-w-full cursor-crosshair"
          style={{ width: timelineWidth + HEADER_WIDTH + 20 }}
          onClick={handleClick}
        >
          {/* Time ruler */}
          <div className="h-5 flex items-end border-b border-[var(--border)]">
            <div className="shrink-0" style={{ width: HEADER_WIDTH }} />
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
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
          <div
            className="flex items-center border-b border-[var(--border)]/30"
            style={{ height: TRACK_HEIGHT }}
          >
            <div
              className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium"
              style={{ width: HEADER_WIDTH }}
            >
              Legendas
            </div>
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
              {captions.map((c) => {
                const itemWidth = Math.max(
                  (c.endTime - c.startTime) * pxPerSecond,
                  6
                );
                const isActive =
                  currentTime >= c.startTime && currentTime < c.endTime;

                return (
                  <div
                    key={c.id}
                    className={`absolute top-1 rounded-md border text-[8px] px-1.5 truncate flex items-center cursor-pointer transition-all duration-150 ${
                      isActive
                        ? "bg-[var(--accent)]/70 border-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/30 z-10"
                        : "bg-[var(--accent)]/30 border-[var(--accent)]/50 text-white/80 hover:bg-[var(--accent)]/50"
                    }`}
                    style={{
                      left: c.startTime * pxPerSecond,
                      width: itemWidth,
                      height: TRACK_HEIGHT - 8,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentTime(c.startTime);
                    }}
                    title={`${c.text} (${c.startTime.toFixed(1)}s - ${c.endTime.toFixed(1)}s)`}
                  >
                    {itemWidth > 30 && (
                      <span className="truncate">{c.text}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Effects track */}
          <div
            className="flex items-center border-b border-[var(--border)]/30"
            style={{ height: TRACK_HEIGHT }}
          >
            <div
              className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium"
              style={{ width: HEADER_WIDTH }}
            >
              Efeitos
            </div>
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
              {effects.map((e) => {
                const color = getEffectColor(e.type);
                const itemWidth = Math.max(
                  (e.endTime - e.startTime) * pxPerSecond,
                  6
                );
                const isActive =
                  currentTime >= e.startTime && currentTime <= e.endTime;

                return (
                  <div
                    key={e.id}
                    className={`absolute top-1 rounded-md border text-[8px] px-1 truncate flex items-center cursor-pointer transition-all duration-150 ${color} ${
                      isActive
                        ? "brightness-125 shadow-sm z-10"
                        : "hover:brightness-110"
                    }`}
                    style={{
                      left: e.startTime * pxPerSecond,
                      width: itemWidth,
                      height: TRACK_HEIGHT - 8,
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setCurrentTime(e.startTime);
                    }}
                    title={`${e.type} (${e.startTime.toFixed(1)}s - ${e.endTime.toFixed(1)}s)`}
                  >
                    {itemWidth > 35 && (
                      <span className="truncate">{e.type}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* B-Roll track */}
          <div className="flex items-center" style={{ height: TRACK_HEIGHT }}>
            <div
              className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium"
              style={{ width: HEADER_WIDTH }}
            >
              B-Roll
            </div>
            <div
              className="relative h-full"
              style={{ width: timelineWidth }}
            >
              {bRollImages.map((b) => {
                const itemWidth = Math.max(
                  (b.endTime - b.startTime) * pxPerSecond,
                  6
                );
                const isActive =
                  currentTime >= b.startTime && currentTime <= b.endTime;

                return (
                  <div
                    key={b.id}
                    className={`absolute top-1 rounded-md border text-[8px] px-1 truncate flex items-center cursor-pointer transition-all duration-150 ${
                      b.url
                        ? isActive
                          ? "bg-orange-500/70 border-orange-400 text-white shadow-sm shadow-orange-500/30 z-10"
                          : "bg-orange-500/40 border-orange-400/60 text-orange-200 hover:bg-orange-500/50"
                        : "bg-gray-500/20 border-gray-500/40 border-dashed text-gray-400"
                    }`}
                    style={{
                      left: b.startTime * pxPerSecond,
                      width: itemWidth,
                      height: TRACK_HEIGHT - 8,
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setCurrentTime(b.startTime);
                    }}
                    title={b.prompt}
                  >
                    {itemWidth > 30 && (
                      <span className="truncate">
                        {b.url ? "B-Roll" : "Pendente"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: HEADER_WIDTH + currentTime * pxPerSecond }}
          >
            <div className="w-2.5 h-2.5 -ml-1 bg-red-500 rounded-full shadow-md shadow-red-500/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
