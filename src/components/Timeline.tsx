"use client";

import { useRef, useMemo, useCallback, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";

const TRACK_HEIGHT = 36;
const EFFECT_ROW_HEIGHT = 28;
const HEADER_WIDTH = 76;
const RULER_HEIGHT = 24;

interface DragState {
  type: "caption" | "effect" | "broll" | "playhead";
  id: string;
  field: "startTime" | "endTime" | "move";
  initialX: number;
  initialStart: number;
  initialEnd: number;
}

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const {
    videoDuration,
    currentTime,
    captions,
    effects,
    bRollImages,
    selectedItem,
    setCurrentTime,
    setSelectedItem,
    updateCaption,
    updateEffect,
    updateBRollImage,
  } = useProjectStore();

  const pxPerSecond = useMemo(() => {
    if (!videoDuration) return 60;
    return Math.max(60, 1100 / videoDuration);
  }, [videoDuration]);

  const timelineWidth = videoDuration * pxPerSecond;

  // Convert pixel X to time
  const pxToTime = useCallback(
    (clientX: number): number => {
      const container = containerRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = clientX - rect.left - HEADER_WIDTH + scrollLeft;
      return Math.min(Math.max(0, x / pxPerSecond), videoDuration);
    },
    [pxPerSecond, videoDuration]
  );

  // Click on empty timeline area → seek
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragState) return;
      const time = pxToTime(e.clientX);
      setCurrentTime(time);
    },
    [pxToTime, setCurrentTime, dragState]
  );

  // === ITEM SELECTION ===
  const handleItemClick = useCallback(
    (type: "caption" | "effect" | "broll", id: string) => {
      setSelectedItem({ type, id });
    },
    [setSelectedItem]
  );

  // === DRAG HANDLERS ===
  const handleDragStart = useCallback(
    (
      e: React.MouseEvent,
      type: DragState["type"],
      id: string,
      field: DragState["field"],
      startTime: number,
      endTime: number
    ) => {
      e.stopPropagation();
      e.preventDefault();
      setDragState({
        type,
        id,
        field,
        initialX: e.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      });
      if (type !== "playhead") {
        handleItemClick(type, id);
      }
    },
    [handleItemClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.initialX;
      const deltaTime = deltaX / pxPerSecond;

      const { type, id, field, initialStart, initialEnd } = dragState;
      const duration = initialEnd - initialStart;

      let newStart = initialStart;
      let newEnd = initialEnd;

      if (field === "move") {
        newStart = Math.max(0, initialStart + deltaTime);
        newEnd = newStart + duration;
        if (newEnd > videoDuration) {
          newEnd = videoDuration;
          newStart = videoDuration - duration;
        }
      } else if (field === "startTime") {
        newStart = Math.max(0, Math.min(initialStart + deltaTime, initialEnd - 0.1));
        newEnd = initialEnd;
      } else if (field === "endTime") {
        newStart = initialStart;
        newEnd = Math.max(initialStart + 0.1, Math.min(initialEnd + deltaTime, videoDuration));
      }

      if (type === "playhead") {
        const time = pxToTime(e.clientX);
        setCurrentTime(time);
        return;
      }

      const updates = { startTime: newStart, endTime: newEnd };

      switch (type) {
        case "caption":
          updateCaption(id, updates);
          break;
        case "effect":
          updateEffect(id, updates);
          break;
        case "broll":
          updateBRollImage(id, updates);
          break;
      }
    },
    [dragState, pxPerSecond, videoDuration, pxToTime, setCurrentTime, updateCaption, updateEffect, updateBRollImage]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

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

  // === EFFECT SUB-ROWS ===
  const effectRows = useMemo(() => {
    const rows: typeof effects[] = [];
    const sorted = [...effects].sort((a, b) => a.startTime - b.startTime);

    for (const effect of sorted) {
      let placed = false;
      for (const row of rows) {
        const overlaps = row.some(
          (existing) => effect.startTime < existing.endTime && effect.endTime > existing.startTime
        );
        if (!overlaps) {
          row.push(effect);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([effect]);
      }
    }
    return rows;
  }, [effects]);

  const effectsTrackHeight = Math.max(EFFECT_ROW_HEIGHT + 4, effectRows.length * EFFECT_ROW_HEIGHT + 4);

  // Total track content height (for playhead spanning)
  const totalTracksHeight = TRACK_HEIGHT + effectsTrackHeight + TRACK_HEIGHT;

  const getEffectColor = (type: string) => {
    if (type.startsWith("zoom"))
      return "bg-blue-500/50 border-blue-400/70 text-blue-200";
    if (type.startsWith("pan") || type === "shake")
      return "bg-green-500/50 border-green-400/70 text-green-200";
    if (type.startsWith("transition"))
      return "bg-yellow-500/50 border-yellow-400/70 text-yellow-200";
    return "bg-purple-500/50 border-purple-400/70 text-purple-200";
  };

  // Touch support for mobile drag
  const handleTouchStart = useCallback(
    (
      e: React.TouchEvent,
      type: DragState["type"],
      id: string,
      field: DragState["field"],
      startTime: number,
      endTime: number
    ) => {
      e.stopPropagation();
      const touch = e.touches[0];
      setDragState({
        type,
        id,
        field,
        initialX: touch.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      });
      if (type !== "playhead") {
        handleItemClick(type, id);
      }
    },
    [handleItemClick]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragState) return;
      const touch = e.touches[0];

      const deltaX = touch.clientX - dragState.initialX;
      const deltaTime = deltaX / pxPerSecond;

      const { type, id, field, initialStart, initialEnd } = dragState;
      const duration = initialEnd - initialStart;

      let newStart = initialStart;
      let newEnd = initialEnd;

      if (field === "move") {
        newStart = Math.max(0, initialStart + deltaTime);
        newEnd = newStart + duration;
        if (newEnd > videoDuration) {
          newEnd = videoDuration;
          newStart = videoDuration - duration;
        }
      } else if (field === "startTime") {
        newStart = Math.max(0, Math.min(initialStart + deltaTime, initialEnd - 0.1));
        newEnd = initialEnd;
      } else if (field === "endTime") {
        newStart = initialStart;
        newEnd = Math.max(initialStart + 0.1, Math.min(initialEnd + deltaTime, videoDuration));
      }

      if (type === "playhead") {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const x = touch.clientX - rect.left - HEADER_WIDTH + scrollLeft;
        const time = Math.min(Math.max(0, x / pxPerSecond), videoDuration);
        setCurrentTime(time);
        return;
      }

      const updates = { startTime: newStart, endTime: newEnd };
      switch (type) {
        case "caption": updateCaption(id, updates); break;
        case "effect": updateEffect(id, updates); break;
        case "broll": updateBRollImage(id, updates); break;
      }
    },
    [dragState, pxPerSecond, videoDuration, setCurrentTime, updateCaption, updateEffect, updateBRollImage]
  );

  const handleTouchEnd = useCallback(() => {
    setDragState(null);
  }, []);

  const ResizeHandle = ({
    side,
    onMouseDown,
  }: {
    side: "left" | "right";
    onMouseDown: (e: React.MouseEvent) => void;
  }) => (
    <div
      className={`absolute top-0 bottom-0 w-2.5 md:w-1.5 cursor-col-resize z-10 hover:bg-white/30 active:bg-white/50 transition-colors ${
        side === "left" ? "left-0 rounded-l-md" : "right-0 rounded-r-md"
      }`}
      onMouseDown={onMouseDown}
    />
  );

  return (
    <div
      className="h-full bg-[var(--surface)] border-t border-[var(--border)] flex flex-col select-none touch-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Scrollable container - both X and Y */}
      <div
        className="flex-1 overflow-auto"
        ref={containerRef}
      >
        <div
          ref={trackAreaRef}
          className={`relative min-w-full ${
            dragState ? "cursor-grabbing" : "cursor-crosshair"
          }`}
          style={{ width: timelineWidth + HEADER_WIDTH + 40 }}
          onClick={handleTrackClick}
        >
          {/* Time ruler - sticky at top */}
          <div
            className="flex items-end border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20"
            style={{ height: RULER_HEIGHT }}
          >
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

          {/* Tracks container (relative, for playhead positioning) */}
          <div className="relative" style={{ minHeight: totalTracksHeight }}>
            {/* Captions track */}
            <div
              className="flex items-center border-b border-[var(--border)]/30"
              style={{ height: TRACK_HEIGHT }}
            >
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{ width: HEADER_WIDTH, position: "sticky", left: 0, zIndex: 5 }}
              >
                Legendas
              </div>
              <div className="relative h-full" style={{ width: timelineWidth }}>
                {captions.map((c) => {
                  const itemWidth = Math.max(
                    (c.endTime - c.startTime) * pxPerSecond,
                    8
                  );
                  const isActive =
                    currentTime >= c.startTime && currentTime < c.endTime;
                  const isHovered = hoveredItem === `caption-${c.id}`;
                  const isSelected = selectedItem?.type === "caption" && selectedItem.id === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`absolute top-1 rounded-md border text-[8px] px-2 truncate flex items-center transition-all duration-100 ${
                        isSelected
                          ? "bg-[var(--accent)]/80 border-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/40 z-20 ring-1 ring-white/30"
                          : isActive
                          ? "bg-[var(--accent)]/70 border-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/30 z-10"
                          : isHovered
                          ? "bg-[var(--accent)]/50 border-[var(--accent)]/80 text-white z-10"
                          : "bg-[var(--accent)]/30 border-[var(--accent)]/50 text-white/80"
                      } ${
                        dragState?.id === c.id
                          ? "cursor-grabbing opacity-80 z-20"
                          : "cursor-grab"
                      }`}
                      style={{
                        left: c.startTime * pxPerSecond,
                        width: itemWidth,
                        height: TRACK_HEIGHT - 8,
                      }}
                      onMouseDown={(e) => {
                        handleDragStart(e, "caption", c.id, "move", c.startTime, c.endTime);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick("caption", c.id);
                      }}
                      onMouseEnter={() => setHoveredItem(`caption-${c.id}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                      title={`${c.text}\n${c.startTime.toFixed(1)}s - ${c.endTime.toFixed(1)}s`}
                    >
                      <ResizeHandle
                        side="left"
                        onMouseDown={(e) =>
                          handleDragStart(e, "caption", c.id, "startTime", c.startTime, c.endTime)
                        }
                      />
                      {itemWidth > 30 && (
                        <span className="truncate mx-1.5">{c.text}</span>
                      )}
                      <ResizeHandle
                        side="right"
                        onMouseDown={(e) =>
                          handleDragStart(e, "caption", c.id, "endTime", c.startTime, c.endTime)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Effects track - dynamic height with sub-rows */}
            <div
              className="flex border-b border-[var(--border)]/30"
              style={{ height: effectsTrackHeight }}
            >
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{ width: HEADER_WIDTH, position: "sticky", left: 0, zIndex: 5 }}
              >
                Efeitos
              </div>
              <div className="relative h-full" style={{ width: timelineWidth }}>
                {effectRows.map((row, rowIndex) =>
                  row.map((e) => {
                    const color = getEffectColor(e.type);
                    const itemWidth = Math.max(
                      (e.endTime - e.startTime) * pxPerSecond,
                      8
                    );
                    const isActive =
                      currentTime >= e.startTime && currentTime <= e.endTime;
                    const isHovered = hoveredItem === `effect-${e.id}`;
                    const isSelected = selectedItem?.type === "effect" && selectedItem.id === e.id;

                    return (
                      <div
                        key={e.id}
                        className={`absolute rounded-md border text-[8px] px-1 truncate flex items-center transition-all duration-100 ${color} ${
                          isSelected
                            ? "brightness-130 shadow-md z-20 ring-1 ring-white/40"
                            : isActive
                            ? "brightness-125 shadow-sm z-10"
                            : isHovered
                            ? "brightness-115 z-10"
                            : "hover:brightness-110"
                        } ${
                          dragState?.id === e.id
                            ? "cursor-grabbing opacity-80 z-20"
                            : "cursor-grab"
                        }`}
                        style={{
                          left: e.startTime * pxPerSecond,
                          width: itemWidth,
                          top: rowIndex * EFFECT_ROW_HEIGHT + 2,
                          height: EFFECT_ROW_HEIGHT - 4,
                        }}
                        onMouseDown={(ev) => {
                          handleDragStart(ev, "effect", e.id, "move", e.startTime, e.endTime);
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleItemClick("effect", e.id);
                        }}
                        onMouseEnter={() => setHoveredItem(`effect-${e.id}`)}
                        onMouseLeave={() => setHoveredItem(null)}
                        title={`${e.type}\n${e.startTime.toFixed(1)}s - ${e.endTime.toFixed(1)}s`}
                      >
                        <ResizeHandle
                          side="left"
                          onMouseDown={(ev) =>
                            handleDragStart(ev, "effect", e.id, "startTime", e.startTime, e.endTime)
                          }
                        />
                        {itemWidth > 40 && (
                          <span className="truncate mx-1.5">{e.type}</span>
                        )}
                        <ResizeHandle
                          side="right"
                          onMouseDown={(ev) =>
                            handleDragStart(ev, "effect", e.id, "endTime", e.startTime, e.endTime)
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* B-Roll track */}
            <div className="flex items-center" style={{ height: TRACK_HEIGHT }}>
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{ width: HEADER_WIDTH, position: "sticky", left: 0, zIndex: 5 }}
              >
                B-Roll
              </div>
              <div className="relative h-full" style={{ width: timelineWidth }}>
                {bRollImages.map((b) => {
                  const itemWidth = Math.max(
                    (b.endTime - b.startTime) * pxPerSecond,
                    8
                  );
                  const isActive =
                    currentTime >= b.startTime && currentTime <= b.endTime;
                  const isHovered = hoveredItem === `broll-${b.id}`;
                  const isSelected = selectedItem?.type === "broll" && selectedItem.id === b.id;

                  return (
                    <div
                      key={b.id}
                      className={`absolute top-1 rounded-md border text-[8px] px-1 truncate flex items-center transition-all duration-100 ${
                        isSelected
                          ? b.url
                            ? "bg-orange-500/80 border-orange-400 text-white shadow-md shadow-orange-500/40 z-20 ring-1 ring-white/30"
                            : "bg-gray-500/40 border-gray-400 border-dashed text-gray-300 z-20 ring-1 ring-white/30"
                          : b.url
                          ? isActive
                            ? "bg-orange-500/70 border-orange-400 text-white shadow-sm shadow-orange-500/30 z-10"
                            : isHovered
                            ? "bg-orange-500/55 border-orange-400/80 text-white z-10"
                            : "bg-orange-500/40 border-orange-400/60 text-orange-200"
                          : "bg-gray-500/20 border-gray-500/40 border-dashed text-gray-400"
                      } ${
                        dragState?.id === b.id
                          ? "cursor-grabbing opacity-80 z-20"
                          : "cursor-grab"
                      }`}
                      style={{
                        left: b.startTime * pxPerSecond,
                        width: itemWidth,
                        height: TRACK_HEIGHT - 8,
                      }}
                      onMouseDown={(ev) => {
                        handleDragStart(ev, "broll", b.id, "move", b.startTime, b.endTime);
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleItemClick("broll", b.id);
                      }}
                      onMouseEnter={() => setHoveredItem(`broll-${b.id}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                      title={`${b.prompt}\n${b.startTime.toFixed(1)}s - ${b.endTime.toFixed(1)}s`}
                    >
                      <ResizeHandle
                        side="left"
                        onMouseDown={(ev) =>
                          handleDragStart(ev, "broll", b.id, "startTime", b.startTime, b.endTime)
                        }
                      />
                      {itemWidth > 30 && (
                        <span className="truncate mx-1.5">
                          {b.url ? "B-Roll" : "Pendente"}
                        </span>
                      )}
                      <ResizeHandle
                        side="right"
                        onMouseDown={(ev) =>
                          handleDragStart(ev, "broll", b.id, "endTime", b.startTime, b.endTime)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Playhead spans all tracks */}
            <div
              className="absolute z-30 group pointer-events-none"
              style={{
                left: HEADER_WIDTH + currentTime * pxPerSecond - 6,
                width: 12,
                top: 0,
                bottom: 0,
              }}
            >
              {/* Thin line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                style={{ left: 5 }}
              />
              {/* Draggable head - pointer events enabled */}
              <div
                className={`absolute top-0 w-3 h-3 rounded-full bg-red-500 shadow-md shadow-red-500/50 cursor-grab pointer-events-auto group-hover:scale-125 transition-transform ${
                  dragState?.type === "playhead"
                    ? "scale-150 cursor-grabbing"
                    : ""
                }`}
                style={{ left: 2 }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragState({
                    type: "playhead",
                    id: "playhead",
                    field: "move",
                    initialX: e.clientX,
                    initialStart: currentTime,
                    initialEnd: currentTime,
                  });
                }}
              />
              {/* Larger invisible hit area - pointer events enabled */}
              <div
                className="absolute top-0 bottom-0 w-full cursor-grab pointer-events-auto"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragState({
                    type: "playhead",
                    id: "playhead",
                    field: "move",
                    initialX: e.clientX,
                    initialStart: currentTime,
                    initialEnd: currentTime,
                  });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
