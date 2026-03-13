"use client";

import { useRef, useCallback, useMemo, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { getModeColor, getModeLabel } from "@/lib/modes";
import { formatTime } from "@/lib/formatTime";
import type { ModeSegment } from "@/types";

const PIXELS_PER_SECOND = 60;
const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 48;
const DRAG_HANDLE_WIDTH = 6;

export default function Timeline() {
  const {
    videoDuration,
    currentTime,
    modeSegments,
    selectedItem,
    setCurrentTime,
    setIsPlaying,
    setSelectedItem,
    updateModeSegment,
  } = useProjectStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [dragEdge, setDragEdge] = useState<{
    segId: string;
    edge: "start" | "end";
  } | null>(null);

  const totalWidth = Math.max(videoDuration * PIXELS_PER_SECOND, 300);

  const timeToX = useCallback(
    (t: number) => (t / (videoDuration || 1)) * totalWidth,
    [videoDuration, totalWidth]
  );

  const xToTime = useCallback(
    (x: number) => Math.max(0, Math.min((x / totalWidth) * (videoDuration || 1), videoDuration)),
    [videoDuration, totalWidth]
  );

  // Ruler markers
  const rulerMarks = useMemo(() => {
    const marks: { time: number; x: number; label: string }[] = [];
    const interval = videoDuration > 60 ? 5 : videoDuration > 20 ? 2 : 1;
    for (let t = 0; t <= videoDuration; t += interval) {
      marks.push({ time: t, x: timeToX(t), label: formatTime(t) });
    }
    return marks;
  }, [videoDuration, timeToX]);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const x = e.clientX - rect.left + scroll.scrollLeft;
      setCurrentTime(xToTime(x));
      setIsPlaying(false);
    },
    [xToTime, setCurrentTime, setIsPlaying]
  );

  const handlePlayheadDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDraggingPlayhead(true);

      const handleMove = (ev: MouseEvent) => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + scroll.scrollLeft;
        setCurrentTime(xToTime(x));
      };

      const handleUp = () => {
        setIsDraggingPlayhead(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [xToTime, setCurrentTime]
  );

  const handleEdgeDragStart = useCallback(
    (e: React.MouseEvent, seg: ModeSegment, edge: "start" | "end") => {
      e.stopPropagation();
      setDragEdge({ segId: seg.id, edge });

      const handleMove = (ev: MouseEvent) => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + scroll.scrollLeft;
        const time = xToTime(x);

        if (edge === "start") {
          updateModeSegment(seg.id, { startTime: Math.min(time, seg.endTime - 0.5) });
        } else {
          updateModeSegment(seg.id, { endTime: Math.max(time, seg.startTime + 0.5) });
        }
      };

      const handleUp = () => {
        setDragEdge(null);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [xToTime, updateModeSegment]
  );

  const handleSegmentClick = useCallback(
    (seg: ModeSegment) => {
      setSelectedItem(
        selectedItem?.id === seg.id ? null : { type: "segment", id: seg.id }
      );
    },
    [selectedItem, setSelectedItem]
  );

  const playheadX = timeToX(currentTime);

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative"
      >
        <div style={{ width: totalWidth + 80, minHeight: "100%" }} className="relative">
          {/* Ruler */}
          <div
            className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] cursor-pointer"
            style={{ height: RULER_HEIGHT, paddingLeft: 72 }}
            onClick={handleRulerClick}
          >
            {rulerMarks.map((mark) => (
              <div
                key={mark.time}
                className="absolute top-0 bottom-0 flex flex-col items-center"
                style={{ left: mark.x + 72 }}
              >
                <div className="w-px h-2 bg-[var(--text-secondary)]/30" />
                <span className="text-[9px] text-[var(--text-secondary)]/60 mt-0.5 select-none">
                  {mark.label}
                </span>
              </div>
            ))}
          </div>

          {/* Mode segments track */}
          <div className="relative" style={{ height: TRACK_HEIGHT, marginTop: 4 }}>
            {/* Track label */}
            <div className="absolute left-0 top-0 bottom-0 w-[72px] bg-[var(--surface)] border-r border-[var(--border)] flex items-center justify-center z-10">
              <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">
                Modo
              </span>
            </div>

            {/* Segments */}
            {modeSegments.map((seg) => {
              const left = timeToX(seg.startTime);
              const width = timeToX(seg.endTime) - left;
              const isSelected = selectedItem?.id === seg.id;
              const color = getModeColor(seg.mode);

              return (
                <div
                  key={seg.id}
                  className={`absolute top-1 bottom-1 rounded-lg cursor-pointer group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-md"
                  }`}
                  style={{
                    left: left + 72,
                    width: Math.max(width, 20),
                    backgroundColor: `${color}33`,
                    borderLeft: `3px solid ${color}`,
                  }}
                  onClick={() => handleSegmentClick(seg)}
                >
                  <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                    <span className="text-[10px] font-semibold truncate" style={{ color }}>
                      {getModeLabel(seg.mode)}
                      {seg.mode === "typography" && seg.typographyText
                        ? `: ${seg.typographyText}`
                        : seg.mode === "broll" && seg.brollQuery
                          ? `: ${seg.brollQuery}`
                          : ""}
                    </span>
                  </div>

                  {/* Drag handles */}
                  <div
                    className="absolute left-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ width: DRAG_HANDLE_WIDTH }}
                    onMouseDown={(e) => handleEdgeDragStart(e, seg, "start")}
                  >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-white/60" />
                  </div>
                  <div
                    className="absolute right-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ width: DRAG_HANDLE_WIDTH }}
                    onMouseDown={(e) => handleEdgeDragStart(e, seg, "end")}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-white/60" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="absolute z-30 cursor-col-resize"
            style={{
              left: playheadX + 72,
              top: 0,
              bottom: 0,
              width: 2,
            }}
            onMouseDown={handlePlayheadDragStart}
          >
            <div className="absolute inset-0 bg-red-500" />
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
