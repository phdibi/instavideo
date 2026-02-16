"use client";

import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { useProjectStore } from "@/store/useProjectStore";

const TRACK_HEIGHT = 40;
const EFFECT_ROW_HEIGHT = 32;
const HEADER_WIDTH = 72;
const RULER_HEIGHT = 24;

// CapCut-style gesture constants
const LONG_PRESS_MS = 200; // Threshold: hold > 200ms = drag, quick swipe = scroll
const MOVE_THRESHOLD = 8; // px of movement before we decide "this is a scroll"

interface DragState {
  type: "caption" | "effect" | "broll" | "playhead";
  id: string;
  field: "startTime" | "endTime" | "move";
  initialX: number;
  initialStart: number;
  initialEnd: number;
}

// Pending touch state for gesture disambiguation
interface PendingTouch {
  type: "caption" | "effect" | "broll";
  id: string;
  field: "startTime" | "endTime" | "move";
  startTime: number;
  endTime: number;
  touchX: number;
  touchY: number;
  timestamp: number;
}

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Gesture disambiguation state
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTouchRef = useRef<PendingTouch | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ type: string; id: string; updates: { startTime: number; endTime: number } } | null>(null);

  // Track if we were playing before drag started so we can resume
  const wasPlayingRef = useRef(false);

  const {
    videoDuration,
    currentTime,
    captions,
    effects,
    bRollImages,
    selectedItem,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
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

  // Commit any pending RAF updates
  const flushPendingUpdate = useCallback(() => {
    const pending = pendingUpdateRef.current;
    if (!pending) return;
    pendingUpdateRef.current = null;

    switch (pending.type) {
      case "caption": updateCaption(pending.id, pending.updates); break;
      case "effect": updateEffect(pending.id, pending.updates); break;
      case "broll": updateBRollImage(pending.id, pending.updates); break;
    }
  }, [updateCaption, updateEffect, updateBRollImage]);

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

  // === PAUSE VIDEO DURING DRAG ===
  const pauseForDrag = useCallback(() => {
    if (isPlaying) {
      wasPlayingRef.current = true;
      setIsPlaying(false);
      // Actually pause the video element
      const vid = document.querySelector("video") as HTMLVideoElement | null;
      if (vid && !vid.paused) vid.pause();
    }
  }, [isPlaying, setIsPlaying]);

  const resumeAfterDrag = useCallback(() => {
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      // Don't auto-resume — let user press play again
    }
  }, []);

  // === MOUSE DRAG HANDLERS (desktop) ===
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
      pauseForDrag();
      setDragState({
        type, id, field,
        initialX: e.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      });
      setActiveDragId(id);
      if (type !== "playhead") handleItemClick(type, id);
    },
    [handleItemClick, pauseForDrag]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.initialX;
      const deltaTime = deltaX / pxPerSecond;
      const { type, id, field, initialStart, initialEnd } = dragState;
      const duration = initialEnd - initialStart;

      if (type === "playhead") {
        setCurrentTime(pxToTime(e.clientX));
        return;
      }

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

      const updates = { startTime: newStart, endTime: newEnd };
      switch (type) {
        case "caption": updateCaption(id, updates); break;
        case "effect": updateEffect(id, updates); break;
        case "broll": updateBRollImage(id, updates); break;
      }
    },
    [dragState, pxPerSecond, videoDuration, pxToTime, setCurrentTime, updateCaption, updateEffect, updateBRollImage]
  );

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      flushPendingUpdate();
      resumeAfterDrag();
    }
    setDragState(null);
    setActiveDragId(null);
  }, [dragState, flushPendingUpdate, resumeAfterDrag]);

  // === TOUCH GESTURE DISAMBIGUATION (CapCut-style) ===
  // Pattern: touch on item starts a timer. If the finger doesn't move >MOVE_THRESHOLD px
  // within LONG_PRESS_MS, it becomes a drag. If it moves quickly, it's a scroll (native).

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pendingTouchRef.current = null;
  }, []);

  const handleItemTouchStart = useCallback(
    (
      e: React.TouchEvent,
      type: "caption" | "effect" | "broll",
      id: string,
      field: DragState["field"],
      startTime: number,
      endTime: number
    ) => {
      // Don't prevent default yet — allow native scroll to work
      e.stopPropagation();
      const touch = e.touches[0];

      clearLongPress();

      // Store pending touch info
      pendingTouchRef.current = {
        type, id, field, startTime, endTime,
        touchX: touch.clientX,
        touchY: touch.clientY,
        timestamp: Date.now(),
      };

      // Start long-press timer
      longPressTimerRef.current = setTimeout(() => {
        const pending = pendingTouchRef.current;
        if (!pending) return;

        // Activate drag mode
        if (navigator.vibrate) navigator.vibrate(25);

        pauseForDrag();
        setDragState({
          type: pending.type,
          id: pending.id,
          field: pending.field,
          initialX: pending.touchX,
          initialStart: pending.startTime,
          initialEnd: pending.endTime,
        });
        setActiveDragId(pending.id);
        handleItemClick(pending.type, pending.id);
        pendingTouchRef.current = null;
      }, LONG_PRESS_MS);
    },
    [clearLongPress, pauseForDrag, handleItemClick]
  );

  // Resize handles activate drag immediately (no long-press needed, like CapCut trim handles)
  const handleResizeTouchStart = useCallback(
    (
      e: React.TouchEvent,
      type: "caption" | "effect" | "broll",
      id: string,
      field: "startTime" | "endTime",
      startTime: number,
      endTime: number
    ) => {
      e.stopPropagation();
      e.preventDefault(); // Prevent scroll for resize handles immediately
      const touch = e.touches[0];

      pauseForDrag();
      setDragState({
        type, id, field,
        initialX: touch.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      });
      setActiveDragId(id);
      handleItemClick(type, id);
    },
    [pauseForDrag, handleItemClick]
  );

  // Container-level touch move: handles both scroll-cancel and drag
  const handleContainerTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];

      // If we have a pending touch (long-press timer running), check if finger moved too much
      if (pendingTouchRef.current) {
        const dx = Math.abs(touch.clientX - pendingTouchRef.current.touchX);
        const dy = Math.abs(touch.clientY - pendingTouchRef.current.touchY);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
          // Finger moved — this is a scroll gesture, cancel long-press
          clearLongPress();
          // Don't preventDefault — let native scroll happen
          return;
        }
      }

      // If drag is active, handle the move
      if (!dragState) return;

      // Prevent scrolling while dragging
      e.preventDefault();

      const deltaX = touch.clientX - dragState.initialX;
      const deltaTime = deltaX / pxPerSecond;
      const { type, id, field, initialStart, initialEnd } = dragState;
      const duration = initialEnd - initialStart;

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

      // RAF-throttled update to prevent video freezing
      const updates = { startTime: newStart, endTime: newEnd };
      pendingUpdateRef.current = { type, id, updates };

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          flushPendingUpdate();
        });
      }
    },
    [dragState, pxPerSecond, videoDuration, setCurrentTime, clearLongPress, flushPendingUpdate]
  );

  const handleContainerTouchEnd = useCallback(() => {
    clearLongPress();

    // If there was a pending touch that didn't become a drag, it's a tap (select)
    if (pendingTouchRef.current) {
      const pending = pendingTouchRef.current;
      handleItemClick(pending.type, pending.id);
      pendingTouchRef.current = null;
    }

    if (dragState) {
      flushPendingUpdate();
      resumeAfterDrag();
    }
    setDragState(null);
    setActiveDragId(null);
  }, [clearLongPress, dragState, flushPendingUpdate, resumeAfterDrag, handleItemClick]);

  // Playhead touch handlers (direct, no long-press)
  const handlePlayheadTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const touch = e.touches[0];
      pauseForDrag();
      setDragState({
        type: "playhead", id: "playhead", field: "move",
        initialX: touch.clientX,
        initialStart: currentTime, initialEnd: currentTime,
      });
    },
    [currentTime, pauseForDrag]
  );

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearLongPress();
    };
  }, [clearLongPress]);

  // Time markers
  const markers = useMemo(() => {
    const interval =
      videoDuration > 60 ? 10
        : videoDuration > 20 ? 5
        : videoDuration > 10 ? 2
        : 1;
    const result: number[] = [];
    for (let t = 0; t <= videoDuration; t += interval) result.push(t);
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
        if (!overlaps) { row.push(effect); placed = true; break; }
      }
      if (!placed) rows.push([effect]);
    }
    return rows;
  }, [effects]);

  const effectsTrackHeight = Math.max(EFFECT_ROW_HEIGHT + 4, effectRows.length * EFFECT_ROW_HEIGHT + 4);
  const totalTracksHeight = TRACK_HEIGHT + effectsTrackHeight + TRACK_HEIGHT;

  const getEffectColor = (type: string) => {
    if (type.startsWith("zoom")) return "bg-blue-500/50 border-blue-400/70 text-blue-200";
    if (type.startsWith("pan") || type === "shake") return "bg-green-500/50 border-green-400/70 text-green-200";
    if (type.startsWith("transition")) return "bg-yellow-500/50 border-yellow-400/70 text-yellow-200";
    return "bg-purple-500/50 border-purple-400/70 text-purple-200";
  };

  // Resize handle with larger touch targets
  const ResizeHandle = ({
    side,
    onMouseDown,
    onTouchStart: onTouchStartProp,
  }: {
    side: "left" | "right";
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart?: (e: React.TouchEvent) => void;
  }) => (
    <div
      className={`absolute top-0 bottom-0 w-4 md:w-1.5 cursor-col-resize z-10 hover:bg-white/30 active:bg-white/50 transition-colors ${
        side === "left" ? "-left-1 md:left-0 rounded-l-md" : "-right-1 md:right-0 rounded-r-md"
      }`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStartProp}
    />
  );

  // The outer container uses touch-action conditionally:
  // When dragging, we prevent scroll. When not, we allow horizontal scroll.
  const isDragging = !!dragState;

  return (
    <div
      className="h-full bg-[var(--surface)] border-t border-[var(--border)] flex flex-col select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={handleContainerTouchEnd}
      onTouchCancel={handleContainerTouchEnd}
      style={{ touchAction: isDragging ? "none" : "pan-x pan-y" }}
    >
      {/* Scrollable container */}
      <div
        className="flex-1 overflow-auto"
        ref={containerRef}
        style={{ touchAction: isDragging ? "none" : "pan-x pan-y" }}
      >
        <div
          ref={trackAreaRef}
          className={`relative min-w-full ${dragState ? "cursor-grabbing" : "cursor-crosshair"}`}
          style={{ width: timelineWidth + HEADER_WIDTH + 40 }}
          onClick={handleTrackClick}
        >
          {/* Time ruler */}
          <div
            className="flex items-end border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20"
            style={{ height: RULER_HEIGHT }}
          >
            <div className="shrink-0" style={{ width: HEADER_WIDTH }} />
            <div className="relative h-full" style={{ width: timelineWidth }}>
              {markers.map((t) => (
                <div key={t} className="absolute bottom-0 text-[9px] text-[var(--text-secondary)] font-mono" style={{ left: t * pxPerSecond }}>
                  <div className="h-2 w-px bg-[var(--border)] mb-0.5" />
                  {t > 0 && <span className="ml-0.5">{t}s</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Tracks */}
          <div className="relative" style={{ minHeight: totalTracksHeight }}>
            {/* === CAPTIONS TRACK === */}
            <div className="flex items-center border-b border-[var(--border)]/30" style={{ height: TRACK_HEIGHT }}>
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{ width: HEADER_WIDTH, position: "sticky", left: 0, zIndex: 5 }}
              >
                Legendas
              </div>
              <div className="relative h-full" style={{ width: timelineWidth }}>
                {captions.map((c) => {
                  const itemWidth = Math.max((c.endTime - c.startTime) * pxPerSecond, 8);
                  const isActive = currentTime >= c.startTime && currentTime < c.endTime;
                  const isHovered = hoveredItem === `caption-${c.id}`;
                  const isSelected = selectedItem?.type === "caption" && selectedItem.id === c.id;
                  const isDraggingThis = activeDragId === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`absolute top-1 rounded-md border text-[8px] px-2 truncate flex items-center will-change-transform ${
                        isSelected
                          ? "bg-[var(--accent)]/80 border-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/40 z-20 ring-1 ring-white/30"
                          : isActive
                          ? "bg-[var(--accent)]/70 border-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/30 z-10"
                          : isHovered
                          ? "bg-[var(--accent)]/50 border-[var(--accent)]/80 text-white z-10"
                          : "bg-[var(--accent)]/30 border-[var(--accent)]/50 text-white/80"
                      } ${isDraggingThis ? "opacity-90 z-30 scale-[1.03] shadow-lg" : "cursor-grab"}`}
                      style={{
                        left: c.startTime * pxPerSecond,
                        width: itemWidth,
                        height: TRACK_HEIGHT - 8,
                        transition: isDraggingThis ? "none" : "box-shadow 0.15s, opacity 0.15s",
                      }}
                      onMouseDown={(e) => handleDragStart(e, "caption", c.id, "move", c.startTime, c.endTime)}
                      onTouchStart={(e) => handleItemTouchStart(e, "caption", c.id, "move", c.startTime, c.endTime)}
                      onClick={(e) => { e.stopPropagation(); handleItemClick("caption", c.id); }}
                      onMouseEnter={() => setHoveredItem(`caption-${c.id}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <ResizeHandle
                        side="left"
                        onMouseDown={(e) => handleDragStart(e, "caption", c.id, "startTime", c.startTime, c.endTime)}
                        onTouchStart={(e) => handleResizeTouchStart(e, "caption", c.id, "startTime", c.startTime, c.endTime)}
                      />
                      {itemWidth > 30 && <span className="truncate mx-2">{c.text}</span>}
                      <ResizeHandle
                        side="right"
                        onMouseDown={(e) => handleDragStart(e, "caption", c.id, "endTime", c.startTime, c.endTime)}
                        onTouchStart={(e) => handleResizeTouchStart(e, "caption", c.id, "endTime", c.startTime, c.endTime)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* === EFFECTS TRACK === */}
            <div className="flex border-b border-[var(--border)]/30" style={{ height: effectsTrackHeight }}>
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
                    const itemWidth = Math.max((e.endTime - e.startTime) * pxPerSecond, 8);
                    const isActive = currentTime >= e.startTime && currentTime <= e.endTime;
                    const isHovered = hoveredItem === `effect-${e.id}`;
                    const isSelected = selectedItem?.type === "effect" && selectedItem.id === e.id;
                    const isDraggingThis = activeDragId === e.id;

                    return (
                      <div
                        key={e.id}
                        className={`absolute rounded-md border text-[8px] px-1 truncate flex items-center will-change-transform ${color} ${
                          isSelected
                            ? "brightness-130 shadow-md z-20 ring-1 ring-white/40"
                            : isActive ? "brightness-125 shadow-sm z-10"
                            : isHovered ? "brightness-115 z-10"
                            : "hover:brightness-110"
                        } ${isDraggingThis ? "opacity-90 z-30 scale-[1.03] shadow-lg" : "cursor-grab"}`}
                        style={{
                          left: e.startTime * pxPerSecond,
                          width: itemWidth,
                          top: rowIndex * EFFECT_ROW_HEIGHT + 2,
                          height: EFFECT_ROW_HEIGHT - 4,
                          transition: isDraggingThis ? "none" : "box-shadow 0.15s, opacity 0.15s",
                        }}
                        onMouseDown={(ev) => handleDragStart(ev, "effect", e.id, "move", e.startTime, e.endTime)}
                        onTouchStart={(ev) => handleItemTouchStart(ev, "effect", e.id, "move", e.startTime, e.endTime)}
                        onClick={(ev) => { ev.stopPropagation(); handleItemClick("effect", e.id); }}
                        onMouseEnter={() => setHoveredItem(`effect-${e.id}`)}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        <ResizeHandle
                          side="left"
                          onMouseDown={(ev) => handleDragStart(ev, "effect", e.id, "startTime", e.startTime, e.endTime)}
                          onTouchStart={(ev) => handleResizeTouchStart(ev, "effect", e.id, "startTime", e.startTime, e.endTime)}
                        />
                        {itemWidth > 40 && <span className="truncate mx-1.5">{e.type}</span>}
                        <ResizeHandle
                          side="right"
                          onMouseDown={(ev) => handleDragStart(ev, "effect", e.id, "endTime", e.startTime, e.endTime)}
                          onTouchStart={(ev) => handleResizeTouchStart(ev, "effect", e.id, "endTime", e.startTime, e.endTime)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* === B-ROLL TRACK === */}
            <div className="flex items-center" style={{ height: TRACK_HEIGHT }}>
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{ width: HEADER_WIDTH, position: "sticky", left: 0, zIndex: 5 }}
              >
                B-Roll
              </div>
              <div className="relative h-full" style={{ width: timelineWidth }}>
                {bRollImages.map((b) => {
                  const itemWidth = Math.max((b.endTime - b.startTime) * pxPerSecond, 8);
                  const isActive = currentTime >= b.startTime && currentTime <= b.endTime;
                  const isHovered = hoveredItem === `broll-${b.id}`;
                  const isSelected = selectedItem?.type === "broll" && selectedItem.id === b.id;
                  const isDraggingThis = activeDragId === b.id;

                  return (
                    <div
                      key={b.id}
                      className={`absolute top-1 rounded-md border text-[8px] px-1 truncate flex items-center will-change-transform ${
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
                      } ${isDraggingThis ? "opacity-90 z-30 scale-[1.03] shadow-lg" : "cursor-grab"}`}
                      style={{
                        left: b.startTime * pxPerSecond,
                        width: itemWidth,
                        height: TRACK_HEIGHT - 8,
                        transition: isDraggingThis ? "none" : "box-shadow 0.15s, opacity 0.15s",
                      }}
                      onMouseDown={(ev) => handleDragStart(ev, "broll", b.id, "move", b.startTime, b.endTime)}
                      onTouchStart={(ev) => handleItemTouchStart(ev, "broll", b.id, "move", b.startTime, b.endTime)}
                      onClick={(ev) => { ev.stopPropagation(); handleItemClick("broll", b.id); }}
                      onMouseEnter={() => setHoveredItem(`broll-${b.id}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <ResizeHandle
                        side="left"
                        onMouseDown={(ev) => handleDragStart(ev, "broll", b.id, "startTime", b.startTime, b.endTime)}
                        onTouchStart={(ev) => handleResizeTouchStart(ev, "broll", b.id, "startTime", b.startTime, b.endTime)}
                      />
                      {itemWidth > 30 && <span className="truncate mx-1.5">{b.url ? "B-Roll" : "Pendente"}</span>}
                      <ResizeHandle
                        side="right"
                        onMouseDown={(ev) => handleDragStart(ev, "broll", b.id, "endTime", b.startTime, b.endTime)}
                        onTouchStart={(ev) => handleResizeTouchStart(ev, "broll", b.id, "endTime", b.startTime, b.endTime)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Playhead */}
            <div
              className="absolute z-30 group pointer-events-none"
              style={{
                left: HEADER_WIDTH + currentTime * pxPerSecond - 7,
                width: 14,
                top: 0, bottom: 0,
              }}
            >
              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500" style={{ left: 6 }} />
              {/* Draggable head */}
              <div
                className={`absolute -top-1 w-4 h-4 md:w-3 md:h-3 rounded-full bg-red-500 shadow-md shadow-red-500/50 cursor-grab pointer-events-auto group-hover:scale-125 transition-transform ${
                  dragState?.type === "playhead" ? "scale-150 cursor-grabbing" : ""
                }`}
                style={{ left: 3 }}
                onMouseDown={(e) => {
                  e.stopPropagation(); e.preventDefault();
                  pauseForDrag();
                  setDragState({ type: "playhead", id: "playhead", field: "move", initialX: e.clientX, initialStart: currentTime, initialEnd: currentTime });
                }}
                onTouchStart={handlePlayheadTouchStart}
              />
              {/* Larger hit area */}
              <div
                className="absolute top-0 bottom-0 w-full cursor-grab pointer-events-auto"
                onMouseDown={(e) => {
                  e.stopPropagation(); e.preventDefault();
                  pauseForDrag();
                  setDragState({ type: "playhead", id: "playhead", field: "move", initialX: e.clientX, initialStart: currentTime, initialEnd: currentTime });
                }}
                onTouchStart={handlePlayheadTouchStart}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
