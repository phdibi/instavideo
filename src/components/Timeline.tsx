"use client";

import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { formatTime } from "@/lib/formatTime";

const TRACK_HEIGHT = 44;
const EFFECT_ROW_HEIGHT = 36;
const HEADER_WIDTH = 72;
const RULER_HEIGHT = 24;

// Tuned gesture constants — CapCut uses ~150ms for long-press
const LONG_PRESS_MS = 150;
const MOVE_THRESHOLD = 6; // px — lower = more responsive drag detection

interface DragState {
  type: "caption" | "effect" | "broll" | "segment" | "playhead";
  id: string;
  field: "startTime" | "endTime" | "move";
  initialX: number;
  initialStart: number;
  initialEnd: number;
}

interface PendingTouch {
  type: "caption" | "effect" | "broll" | "segment";
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
  const pendingUpdateRef = useRef<{
    type: string;
    id: string;
    updates: { startTime: number; endTime: number };
  } | null>(null);

  const wasPlayingRef = useRef(false);

  // Frozen row map for effects — prevents row jumping during drag
  const frozenEffectRowMapRef = useRef<Map<string, number> | null>(null);

  // === MULTI-SELECT STATE (Shift+Click bulk editing) ===
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  // Track initial positions for multi-select drag
  const multiDragInitialRef = useRef<Map<string, { startTime: number; endTime: number }> | null>(null);

  const {
    videoDuration,
    currentTime,
    captions,
    effects,
    bRollImages,
    segments,
    selectedItem,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    setSelectedItem,
    updateCaption,
    updateEffect,
    updateBRollImage,
    updateSegment,
    deleteCaption,
    deleteEffect,
    deleteBRollImage,
    deleteSegment,
    batchOffsetItems,
  } = useProjectStore();

  // Helper: compute effect row map from current effects (same algo as effectRows memo)
  const snapshotEffectRowMap = useCallback(() => {
    const rowMap = new Map<string, number>();
    const rows: { id: string; startTime: number; endTime: number }[][] = [];
    const sorted = [...effects].sort((a, b) => a.startTime - b.startTime);
    for (const effect of sorted) {
      let placed = false;
      for (let ri = 0; ri < rows.length; ri++) {
        const overlaps = rows[ri].some(
          (existing) => effect.startTime < existing.endTime && effect.endTime > existing.startTime
        );
        if (!overlaps) {
          rows[ri].push(effect);
          rowMap.set(effect.id, ri);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([effect]);
        rowMap.set(effect.id, rows.length - 1);
      }
    }
    return rowMap;
  }, [effects]);

  const pxPerSecond = useMemo(() => {
    if (!videoDuration) return 60;
    return Math.max(60, 1100 / videoDuration);
  }, [videoDuration]);

  const timelineWidth = videoDuration * pxPerSecond;

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

  // Snap time to grid or to nearby item boundaries for precise editing
  const SNAP_GRID = 0.05; // 50ms grid for fine control
  const SNAP_MAGNETIC = 0.15; // seconds — magnetic snap range to other items' edges
  const snapTime = useCallback(
    (time: number, field: "startTime" | "endTime", excludeId?: string): number => {
      // First: collect all item edge times for magnetic snapping
      const edges: number[] = [0, videoDuration];
      for (const c of captions) {
        if (c.id === excludeId) continue;
        edges.push(c.startTime, c.endTime);
      }
      for (const e of effects) {
        if (e.id === excludeId) continue;
        edges.push(e.startTime, e.endTime);
      }
      for (const b of bRollImages) {
        if (b.id === excludeId) continue;
        edges.push(b.startTime, b.endTime);
      }

      // Magnetic snap: find nearest edge within range
      let snapped = time;
      let bestDist = SNAP_MAGNETIC;
      for (const edge of edges) {
        const dist = Math.abs(time - edge);
        if (dist < bestDist) {
          bestDist = dist;
          snapped = edge;
        }
      }

      // If no magnetic snap hit, snap to grid
      if (snapped === time) {
        snapped = Math.round(time / SNAP_GRID) * SNAP_GRID;
      }

      return Math.max(0, Math.min(snapped, videoDuration));
    },
    [videoDuration, captions, effects, bRollImages]
  );

  const flushPendingUpdate = useCallback(() => {
    const pending = pendingUpdateRef.current;
    if (!pending) return;
    pendingUpdateRef.current = null;

    switch (pending.type) {
      case "caption":
        updateCaption(pending.id, pending.updates);
        break;
      case "effect":
        updateEffect(pending.id, pending.updates);
        break;
      case "broll":
        updateBRollImage(pending.id, pending.updates);
        break;
      case "segment":
        updateSegment(pending.id, pending.updates);
        break;
    }
  }, [updateCaption, updateEffect, updateBRollImage, updateSegment]);

  // === MULTI-SELECT HELPERS ===
  const makeKey = useCallback((type: string, id: string) => `${type}:${id}`, []);
  const parseKey = useCallback((key: string): { type: "caption" | "effect" | "broll" | "segment"; id: string } => {
    const [type, ...rest] = key.split(":");
    return { type: type as "caption" | "effect" | "broll" | "segment", id: rest.join(":") };
  }, []);

  const toggleMultiSelect = useCallback(
    (type: "caption" | "effect" | "broll" | "segment", id: string) => {
      const key = makeKey(type, id);
      setMultiSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [makeKey]
  );

  const clearMultiSelect = useCallback(() => {
    setMultiSelected(new Set());
    multiDragInitialRef.current = null;
  }, []);

  // Parse multi-selected items for batch operations
  const multiSelectedItems = useMemo(
    () => Array.from(multiSelected).map(parseKey),
    [multiSelected, parseKey]
  );

  // Keyboard shortcuts: Escape clears multi-selection, Delete removes selected, Ctrl+A selects all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if (isInput) return;

      if (e.key === "Escape" && multiSelected.size > 0) {
        clearMultiSelect();
      }

      // Delete or Backspace — remove selected items
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // Delete all multi-selected items
        if (multiSelected.size > 0) {
          for (const key of multiSelected) {
            const { type, id } = parseKey(key);
            if (type === "caption") deleteCaption(id);
            else if (type === "effect") deleteEffect(id);
            else if (type === "broll") deleteBRollImage(id);
            else if (type === "segment") deleteSegment(id);
          }
          clearMultiSelect();
          setSelectedItem(null);
          return;
        }
        // Delete single selected item
        if (selectedItem) {
          if (selectedItem.type === "caption") deleteCaption(selectedItem.id);
          else if (selectedItem.type === "effect") deleteEffect(selectedItem.id);
          else if (selectedItem.type === "broll") deleteBRollImage(selectedItem.id);
          else if (selectedItem.type === "segment") deleteSegment(selectedItem.id);
          setSelectedItem(null);
        }
      }

      // Ctrl+A or Cmd+A — select all captions
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        if (captions.length > 0) {
          e.preventDefault();
          const allCaptionKeys = new Set(captions.map((c) => makeKey("caption", c.id)));
          setMultiSelected(allCaptionKeys);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [multiSelected, clearMultiSelect, captions, makeKey, parseKey, selectedItem, setSelectedItem, deleteCaption, deleteEffect, deleteBRollImage, deleteSegment]);

  // Batch offset with buttons
  const handleBatchOffset = useCallback(
    (delta: number) => {
      if (multiSelectedItems.length === 0) return;
      batchOffsetItems(multiSelectedItems, delta);
    },
    [multiSelectedItems, batchOffsetItems]
  );

  // Only seek the playhead when clicking on the RULER area (top time bar),
  // NOT when clicking on the track items area below it
  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragState) return;
      e.stopPropagation();
      const time = pxToTime(e.clientX);
      setCurrentTime(time);
    },
    [pxToTime, setCurrentTime, dragState]
  );

  const handleItemClick = useCallback(
    (type: "caption" | "effect" | "broll" | "segment", id: string, shiftKey?: boolean) => {
      if (shiftKey) {
        toggleMultiSelect(type, id);
        return;
      }
      // Normal click clears multi-select and selects single item
      if (multiSelected.size > 0) {
        clearMultiSelect();
      }
      setSelectedItem({ type, id });
    },
    [setSelectedItem, toggleMultiSelect, clearMultiSelect, multiSelected]
  );

  // === PAUSE VIDEO DURING DRAG ===
  const pauseForDrag = useCallback(() => {
    if (isPlaying) {
      wasPlayingRef.current = true;
      setIsPlaying(false);
      const vid = document.querySelector("video") as HTMLVideoElement | null;
      if (vid && !vid.paused) vid.pause();
    }
  }, [isPlaying, setIsPlaying]);

  const resumeAfterDrag = useCallback(() => {
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      // Actually resume playback
      setIsPlaying(true);
      const vid = document.querySelector("video") as HTMLVideoElement | null;
      if (vid && vid.paused) {
        vid.play().catch(() => {
          // Play failed, sync state back
          setIsPlaying(false);
        });
      }
    }
  }, [setIsPlaying]);

  // === MOUSE DRAG (desktop) ===
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

      // Shift+mouseDown → do NOT start drag, let onClick handle multi-select.
      // IMPORTANT: we must NOT call toggleMultiSelect here because onClick
      // will also fire and call it — double-toggling cancels the selection.
      if (e.shiftKey && type !== "playhead") {
        return;
      }

      pauseForDrag();
      // Snapshot effect row assignments for stable drag
      if (type === "effect") {
        frozenEffectRowMapRef.current = snapshotEffectRowMap();
      }

      const dragKey = makeKey(type, id);
      const isPartOfMultiSelect = multiSelected.has(dragKey);

      setDragState({
        type,
        id,
        field,
        initialX: e.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      });
      setActiveDragId(id);

      // Snapshot positions of all multi-selected items for coordinated drag
      if (isPartOfMultiSelect && field === "move" && multiSelected.size > 1) {
        const posMap = new Map<string, { startTime: number; endTime: number }>();
        for (const key of multiSelected) {
          const parsed = parseKey(key);
          let item: { startTime: number; endTime: number } | undefined;
          if (parsed.type === "caption") item = captions.find((c) => c.id === parsed.id);
          else if (parsed.type === "effect") item = effects.find((e) => e.id === parsed.id);
          else if (parsed.type === "broll") item = bRollImages.find((b) => b.id === parsed.id);
          else if (parsed.type === "segment") item = segments.find((s) => s.id === parsed.id);
          if (item) posMap.set(key, { startTime: item.startTime, endTime: item.endTime });
        }
        multiDragInitialRef.current = posMap;
      } else {
        multiDragInitialRef.current = null;
      }

      // Only update single selection if this item is NOT part of multi-select
      // (otherwise we'd clear the multi-select when trying to drag the group)
      if (type !== "playhead" && !isPartOfMultiSelect) {
        if (multiSelected.size > 0) clearMultiSelect();
        setSelectedItem({ type, id });
      }
    },
    [pauseForDrag, snapshotEffectRowMap, multiSelected, parseKey, makeKey, captions, effects, bRollImages, segments, clearMultiSelect, setSelectedItem]
  );

  // Auto-scroll timeline when dragging near edges (like CapCut)
  const autoScroll = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edgeZone = 40; // px from edge to start scrolling
    const scrollSpeed = 3; // px per frame

    if (clientX < rect.left + edgeZone + HEADER_WIDTH) {
      container.scrollLeft -= scrollSpeed;
    } else if (clientX > rect.right - edgeZone) {
      container.scrollLeft += scrollSpeed;
    }
  }, []);

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

      // Auto-scroll when near edges
      autoScroll(e.clientX);

      // === MULTI-SELECT DRAG: move all selected items together ===
      if (field === "move" && multiDragInitialRef.current && multiDragInitialRef.current.size > 1) {
        for (const [key, initial] of multiDragInitialRef.current) {
          const parsed = parseKey(key);
          const dur = initial.endTime - initial.startTime;
          let ns = Math.max(0, initial.startTime + deltaTime);
          let ne = ns + dur;
          if (ne > videoDuration) { ne = videoDuration; ns = videoDuration - dur; }
          const updates = { startTime: ns, endTime: ne };
          if (parsed.type === "caption") updateCaption(parsed.id, updates);
          else if (parsed.type === "effect") updateEffect(parsed.id, updates);
          else if (parsed.type === "broll") updateBRollImage(parsed.id, updates);
          else if (parsed.type === "segment") updateSegment(parsed.id, updates);
        }
        // Update playhead to follow the dragged item
        setCurrentTime(Math.max(0, initialStart + deltaTime));
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
        const raw = Math.max(0, Math.min(initialStart + deltaTime, initialEnd - 0.1));
        newStart = snapTime(raw, "startTime", id);
        newStart = Math.min(newStart, initialEnd - 0.1); // ensure min duration
        newEnd = initialEnd;
      } else if (field === "endTime") {
        const raw = Math.max(initialStart + 0.1, Math.min(initialEnd + deltaTime, videoDuration));
        newEnd = snapTime(raw, "endTime", id);
        newEnd = Math.max(newEnd, initialStart + 0.1); // ensure min duration
        newStart = initialStart;
      }

      // Update playhead to follow drag for real-time preview
      if (field === "move") {
        setCurrentTime(newStart);
      } else if (field === "startTime") {
        setCurrentTime(newStart);
      } else if (field === "endTime") {
        setCurrentTime(newEnd);
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
        case "segment":
          updateSegment(id, updates);
          break;
      }
    },
    [
      dragState,
      pxPerSecond,
      videoDuration,
      pxToTime,
      setCurrentTime,
      autoScroll,
      snapTime,
      updateCaption,
      updateEffect,
      updateBRollImage,
      updateSegment,
      parseKey,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      flushPendingUpdate();
      resumeAfterDrag();
    }
    setDragState(null);
    setActiveDragId(null);
    frozenEffectRowMapRef.current = null;
    multiDragInitialRef.current = null;
  }, [dragState, flushPendingUpdate, resumeAfterDrag]);

  // === TOUCH GESTURE DISAMBIGUATION ===
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
      type: "caption" | "effect" | "broll" | "segment",
      id: string,
      field: DragState["field"],
      startTime: number,
      endTime: number
    ) => {
      e.stopPropagation();
      const touch = e.touches[0];
      clearLongPress();

      pendingTouchRef.current = {
        type,
        id,
        field,
        startTime,
        endTime,
        touchX: touch.clientX,
        touchY: touch.clientY,
        timestamp: Date.now(),
      };

      longPressTimerRef.current = setTimeout(() => {
        const pending = pendingTouchRef.current;
        if (!pending) return;

        if (navigator.vibrate) navigator.vibrate(20);

        pauseForDrag();
        // Snapshot effect row assignments for stable drag (touch)
        if (pending.type === "effect") {
          frozenEffectRowMapRef.current = snapshotEffectRowMap();
        }
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
    [clearLongPress, pauseForDrag, handleItemClick, snapshotEffectRowMap]
  );

  // Resize handles activate IMMEDIATELY (no long-press) — like CapCut trim handles
  const handleResizeTouchStart = useCallback(
    (
      e: React.TouchEvent,
      type: "caption" | "effect" | "broll" | "segment",
      id: string,
      field: "startTime" | "endTime",
      startTime: number,
      endTime: number
    ) => {
      e.stopPropagation();
      e.preventDefault();
      const touch = e.touches[0];

      if (navigator.vibrate) navigator.vibrate(15);
      pauseForDrag();
      // Snapshot effect row assignments for stable drag (resize touch)
      if (type === "effect") {
        frozenEffectRowMapRef.current = snapshotEffectRowMap();
      }
      setDragState({
        type,
        id,
        field,
        initialX: touch.clientX,
        initialStart: startTime,
        initialEnd: endTime,
      });
      setActiveDragId(id);
      handleItemClick(type, id);
    },
    [pauseForDrag, handleItemClick, snapshotEffectRowMap]
  );

  const handleContainerTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];

      if (pendingTouchRef.current) {
        const dx = Math.abs(touch.clientX - pendingTouchRef.current.touchX);
        const dy = Math.abs(touch.clientY - pendingTouchRef.current.touchY);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
          clearLongPress();
          return;
        }
      }

      if (!dragState) return;
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

      // Auto-scroll when near edges
      autoScroll(touch.clientX);

      // === MULTI-SELECT TOUCH DRAG ===
      if (field === "move" && multiDragInitialRef.current && multiDragInitialRef.current.size > 1) {
        for (const [key, initial] of multiDragInitialRef.current) {
          const parsed = parseKey(key);
          const dur = initial.endTime - initial.startTime;
          let ns = Math.max(0, initial.startTime + deltaTime);
          let ne = ns + dur;
          if (ne > videoDuration) { ne = videoDuration; ns = videoDuration - dur; }
          const updates = { startTime: ns, endTime: ne };
          if (parsed.type === "caption") updateCaption(parsed.id, updates);
          else if (parsed.type === "effect") updateEffect(parsed.id, updates);
          else if (parsed.type === "broll") updateBRollImage(parsed.id, updates);
          else if (parsed.type === "segment") updateSegment(parsed.id, updates);
        }
        setCurrentTime(Math.max(0, initialStart + deltaTime));
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
        const raw = Math.max(0, Math.min(initialStart + deltaTime, initialEnd - 0.1));
        newStart = snapTime(raw, "startTime", id);
        newStart = Math.min(newStart, initialEnd - 0.1);
        newEnd = initialEnd;
      } else if (field === "endTime") {
        const raw = Math.max(initialStart + 0.1, Math.min(initialEnd + deltaTime, videoDuration));
        newEnd = snapTime(raw, "endTime", id);
        newEnd = Math.max(newEnd, initialStart + 0.1);
        newStart = initialStart;
      }

      // Update playhead to follow drag for real-time preview
      if (field === "move") {
        setCurrentTime(newStart);
      } else if (field === "startTime") {
        setCurrentTime(newStart);
      } else if (field === "endTime") {
        setCurrentTime(newEnd);
      }

      // RAF-throttled update
      const updates = { startTime: newStart, endTime: newEnd };
      pendingUpdateRef.current = { type, id, updates };

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          flushPendingUpdate();
        });
      }
    },
    [
      dragState,
      pxPerSecond,
      videoDuration,
      setCurrentTime,
      clearLongPress,
      autoScroll,
      snapTime,
      flushPendingUpdate,
      parseKey,
      updateCaption,
      updateEffect,
      updateBRollImage,
      updateSegment,
    ]
  );

  const handleContainerTouchEnd = useCallback(() => {
    clearLongPress();

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
    frozenEffectRowMapRef.current = null;
    multiDragInitialRef.current = null;
  }, [
    clearLongPress,
    dragState,
    flushPendingUpdate,
    resumeAfterDrag,
    handleItemClick,
  ]);

  const handlePlayheadTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const touch = e.touches[0];
      pauseForDrag();
      setDragState({
        type: "playhead",
        id: "playhead",
        field: "move",
        initialX: touch.clientX,
        initialStart: currentTime,
        initialEnd: currentTime,
      });
    },
    [currentTime, pauseForDrag]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearLongPress();
    };
  }, [clearLongPress]);

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
    for (let t = 0; t <= videoDuration; t += interval) result.push(t);
    return result;
  }, [videoDuration]);

  // === EFFECT CATEGORIES ===
  const EFFECT_CATEGORIES = useMemo(() => [
    {
      key: "transition",
      label: "✨ Transições",
      types: ["transition-fade", "transition-swipe", "transition-zoom", "transition-glitch"],
      color: "bg-yellow-500/50 border-yellow-400/70 text-yellow-200",
    },
    {
      key: "zoom",
      label: "🔎 Zoom",
      types: ["zoom-in", "zoom-out", "zoom-pulse"],
      color: "bg-blue-500/50 border-blue-400/70 text-blue-200",
    },
    {
      key: "movement",
      label: "🎥 Movimento",
      types: ["pan-left", "pan-right", "pan-up", "pan-down", "shake"],
      color: "bg-green-500/50 border-green-400/70 text-green-200",
    },
    {
      key: "visual",
      label: "🎨 Visuais",
      types: ["color-grade", "vignette", "letterbox", "flash", "blur-background", "slow-motion", "speed-ramp"],
      color: "bg-purple-500/50 border-purple-400/70 text-purple-200",
    },
  ], []);

  // Group effects by category and row-pack each category independently
  const categorizedEffects = useMemo(() => {
    const frozenMap = frozenEffectRowMapRef.current;

    return EFFECT_CATEGORIES.map((cat) => {
      const catEffects = effects.filter((e) => cat.types.includes(e.type));
      const sorted = [...catEffects].sort((a, b) => a.startTime - b.startTime);
      const rows: (typeof effects)[] = [];

      for (const effect of sorted) {
        if (frozenMap && activeDragId && frozenMap.has(effect.id)) {
          const frozenRow = frozenMap.get(effect.id)!;
          while (rows.length <= frozenRow) rows.push([]);
          rows[frozenRow].push(effect);
          continue;
        }

        let placed = false;
        for (const row of rows) {
          const overlaps = row.some(
            (existing) =>
              effect.startTime < existing.endTime &&
              effect.endTime > existing.startTime
          );
          if (!overlaps) {
            row.push(effect);
            placed = true;
            break;
          }
        }
        if (!placed) rows.push([effect]);
      }

      return { ...cat, rows, count: catEffects.length };
    }).filter((cat) => cat.count > 0); // Hide empty categories
  }, [effects, activeDragId, EFFECT_CATEGORIES]);

  const PRESET_TRACK_HEIGHT = segments.length > 0 ? 32 : 0;
  const effectsTrackHeight = categorizedEffects.reduce(
    (total, cat) => total + Math.max(EFFECT_ROW_HEIGHT + 4, cat.rows.length * EFFECT_ROW_HEIGHT + 4),
    0
  ) || (EFFECT_ROW_HEIGHT + 4); // Minimum height when no effects
  const totalTracksHeight = PRESET_TRACK_HEIGHT + TRACK_HEIGHT + effectsTrackHeight + TRACK_HEIGHT;

  // Freeze height during drag to prevent layout jumps
  const frozenTracksHeightRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeDragId) {
      // Capture height at drag start
      if (frozenTracksHeightRef.current === null) {
        frozenTracksHeightRef.current = totalTracksHeight;
      }
    } else {
      frozenTracksHeightRef.current = null;
    }
  }, [activeDragId, totalTracksHeight]);

  const stableTracksHeight = frozenTracksHeightRef.current ?? totalTracksHeight;

  const getEffectColor = (type: string) => {
    for (const cat of EFFECT_CATEGORIES) {
      if (cat.types.includes(type)) return cat.color;
    }
    return "bg-purple-500/50 border-purple-400/70 text-purple-200";
  };


  // Resize handle — extra large touch target with visual affordance
  // Inspired by CapCut: bright colored handles when selected, always easy to grab
  const ResizeHandle = ({
    side,
    isSelected,
    onMouseDown,
    onTouchStart: onTouchStartProp,
  }: {
    side: "left" | "right";
    isSelected?: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart?: (e: React.TouchEvent) => void;
  }) => (
    <div
      className={`absolute top-0 bottom-0 cursor-col-resize z-10 flex items-center justify-center
        ${side === "left" ? "rounded-l-md" : "rounded-r-md"}
        ${isSelected
          ? "w-7 md:w-3 bg-white/30 hover:bg-white/50 border-white/60"
          : "w-6 md:w-2 hover:bg-white/30"
        }
        active:bg-white/60 transition-colors`}
      style={{
        [side === "left" ? "left" : "right"]: isSelected ? -4 : -2,
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStartProp}
    >
      {/* Visual grip indicator — always visible when selected */}
      {isSelected && (
        <div className="flex flex-col gap-[2px]">
          <div className="w-[3px] h-[6px] bg-white/90 rounded-full" />
          <div className="w-[3px] h-[6px] bg-white/90 rounded-full" />
          <div className="w-[3px] h-[6px] bg-white/90 rounded-full" />
        </div>
      )}
    </div>
  );

  const isDragging = !!dragState;

  // Lock body scroll during drag to prevent the entire page/container from shifting
  useEffect(() => {
    if (isDragging) {
      const prev = document.body.style.overflow;
      const prevTouch = document.body.style.touchAction;
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      return () => {
        document.body.style.overflow = prev;
        document.body.style.touchAction = prevTouch;
      };
    }
  }, [isDragging]);

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
      {/* Multi-select toolbar — Shift+Click bulk editing */}
      {multiSelected.size > 0 && !isDragging && (
        <div className="shrink-0 bg-sky-500/15 border-b border-sky-400/30 px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-sky-300 font-medium">
              ⇧ {multiSelected.size} selecionado{multiSelected.size > 1 ? "s" : ""}
            </span>
            <span className="text-[9px] text-white/40">|</span>
            <span className="text-[9px] text-white/50">Shift+Click para adicionar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/30 text-sky-200 hover:bg-sky-500/50 active:bg-sky-500/70 transition-colors"
              onClick={() => handleBatchOffset(-0.5)}
              title="Antecipar 0.5s"
            >
              -0.5s
            </button>
            <button
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/30 text-sky-200 hover:bg-sky-500/50 active:bg-sky-500/70 transition-colors"
              onClick={() => handleBatchOffset(-0.1)}
              title="Antecipar 0.1s"
            >
              -0.1s
            </button>
            <button
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/30 text-sky-200 hover:bg-sky-500/50 active:bg-sky-500/70 transition-colors"
              onClick={() => handleBatchOffset(0.1)}
              title="Atrasar 0.1s"
            >
              +0.1s
            </button>
            <button
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/30 text-sky-200 hover:bg-sky-500/50 active:bg-sky-500/70 transition-colors"
              onClick={() => handleBatchOffset(0.5)}
              title="Atrasar 0.5s"
            >
              +0.5s
            </button>
            <span className="text-[9px] text-white/30 mx-1">|</span>
            <button
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
              onClick={clearMultiSelect}
              title="Limpar seleção (Esc)"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Drag mode indicator with precise time display */}
      {isDragging && dragState.type !== "playhead" && (
        <div className="shrink-0 bg-[var(--accent)]/15 border-b border-[var(--accent)]/30 px-3 py-1 flex items-center justify-center gap-3">
          <span className="text-[10px] text-[var(--accent-light)] font-medium">
            {dragState.field === "move"
              ? multiDragInitialRef.current && multiDragInitialRef.current.size > 1
                ? `↔ Mover ${multiDragInitialRef.current.size} itens`
                : "↔ Mover"
              : dragState.field === "startTime"
                ? "← Início"
                : "→ Fim"}
          </span>
          <span className="text-[11px] text-white font-mono font-bold bg-[var(--accent)]/40 px-2 py-0.5 rounded">
            {formatTime(currentTime)}
          </span>
        </div>
      )}

      {/* Scrollable container */}
      <div
        className={`flex-1 ${isDragging ? "overflow-hidden" : "overflow-auto"}`}
        ref={containerRef}
        style={{ touchAction: isDragging ? "none" : "pan-x pan-y" }}
      >
        <div
          ref={trackAreaRef}
          className={`relative min-w-full ${dragState ? "cursor-grabbing" : ""}`}
          style={{ width: timelineWidth + HEADER_WIDTH + 40 }}
        >
          {/* Time ruler — click here to seek playhead */}
          <div
            className="flex items-end border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20 cursor-crosshair"
            style={{ height: RULER_HEIGHT }}
            onClick={handleRulerClick}
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

          {/* Tracks */}
          <div className="relative" style={{ minHeight: stableTracksHeight }}>
            {/* === PRESET SEGMENTS TRACK === */}
            {segments.length > 0 && (
              <div
                className="flex items-center border-b border-[var(--border)]/30"
                style={{ height: PRESET_TRACK_HEIGHT }}
              >
                <div
                  className="shrink-0 px-1.5 text-[8px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                  style={{
                    width: HEADER_WIDTH,
                    position: "sticky",
                    left: 0,
                    zIndex: 5,
                  }}
                >
                  AI Edit
                </div>
                <div
                  className="relative h-full"
                  style={{ width: timelineWidth }}
                >
                  {segments.map((seg) => {
                    const itemWidth = Math.max(
                      (seg.endTime - seg.startTime) * pxPerSecond,
                      20
                    );
                    const presetColors: Record<string, { base: string; active: string; selected: string; hovered: string }> = {
                      "hook": {
                        base: "bg-red-500/40 border-red-400/60 text-red-200",
                        active: "bg-red-500/60 border-red-400 text-white shadow-sm shadow-red-500/30 z-10",
                        selected: "bg-red-500/70 border-red-400 text-white shadow-md shadow-red-500/40 z-20 ring-2 ring-white/40",
                        hovered: "bg-red-500/50 border-red-400/80 text-white z-10",
                      },
                      "talking-head": {
                        base: "bg-blue-500/50 border-blue-400/70 text-blue-100",
                        active: "bg-blue-500/65 border-blue-400 text-white shadow-sm shadow-blue-500/30 z-10",
                        selected: "bg-blue-500/80 border-blue-400 text-white shadow-md shadow-blue-500/40 z-20 ring-2 ring-white/40",
                        hovered: "bg-blue-500/55 border-blue-400/90 text-white z-10",
                      },
                      "talking-head-broll": {
                        base: "bg-orange-500/35 border-orange-400/55 text-orange-200",
                        active: "bg-orange-500/55 border-orange-400 text-white shadow-sm shadow-orange-500/30 z-10",
                        selected: "bg-orange-500/70 border-orange-400 text-white shadow-md shadow-orange-500/40 z-20 ring-2 ring-white/40",
                        hovered: "bg-orange-500/45 border-orange-400/80 text-white z-10",
                      },
                      "futuristic-hud": {
                        base: "bg-cyan-500/35 border-cyan-400/55 text-cyan-200",
                        active: "bg-cyan-500/55 border-cyan-400 text-white shadow-sm shadow-cyan-500/30 z-10",
                        selected: "bg-cyan-500/70 border-cyan-400 text-white shadow-md shadow-cyan-500/40 z-20 ring-2 ring-white/40",
                        hovered: "bg-cyan-500/45 border-cyan-400/80 text-white z-10",
                      },
                    };
                    const presetLabels: Record<string, string> = {
                      "hook": "Hook",
                      "talking-head": "TH",
                      "talking-head-broll": "TH+BR",
                      "futuristic-hud": "HUD",
                    };
                    const isActive = currentTime >= seg.startTime && currentTime < seg.endTime;
                    const isHovered = hoveredItem === `segment-${seg.id}`;
                    const isSelected = selectedItem?.type === "segment" && selectedItem.id === seg.id;
                    const isMultiSel = multiSelected.has(makeKey("segment", seg.id));
                    const isDraggingThis = activeDragId === seg.id;
                    const colors = presetColors[seg.preset] || {
                      base: "bg-gray-500/30 border-gray-400/50 text-gray-200",
                      active: "bg-gray-500/50 border-gray-400 text-white z-10",
                      selected: "bg-gray-500/70 border-gray-400 text-white z-20 ring-2 ring-white/40",
                      hovered: "bg-gray-500/40 border-gray-400/80 text-white z-10",
                    };
                    const colorClass = isMultiSel ? `${colors.active} ring-2 ring-sky-400/70 z-15` : isSelected ? colors.selected : isActive ? colors.active : isHovered ? colors.hovered : colors.base;

                    return (
                      <div
                        key={seg.id}
                        className={`absolute top-0.5 rounded-md border text-[7px] font-medium px-1 truncate flex items-center will-change-transform ${colorClass} ${isDraggingThis ? "opacity-90 z-30 scale-y-110 shadow-lg" : "cursor-grab"}`}
                        style={{
                          left: seg.startTime * pxPerSecond,
                          width: itemWidth,
                          height: PRESET_TRACK_HEIGHT - 4,
                          transition: isDraggingThis ? "none" : "box-shadow 0.15s, opacity 0.15s",
                        }}
                        title={`AI Edit: ${seg.preset} — "${seg.text.slice(0, 40)}..."`}
                        onMouseDown={(e) =>
                          handleDragStart(e, "segment", seg.id, "move", seg.startTime, seg.endTime)
                        }
                        onTouchStart={(e) =>
                          handleItemTouchStart(e, "segment", seg.id, "move", seg.startTime, seg.endTime)
                        }
                        onClick={(e) => { e.stopPropagation(); handleItemClick("segment", seg.id, e.shiftKey); }}
                        onMouseEnter={() => setHoveredItem(`segment-${seg.id}`)}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        <ResizeHandle
                          side="left"
                          isSelected={isSelected}
                          onMouseDown={(e) =>
                            handleDragStart(e, "segment", seg.id, "startTime", seg.startTime, seg.endTime)
                          }
                          onTouchStart={(e) =>
                            handleResizeTouchStart(e, "segment", seg.id, "startTime", seg.startTime, seg.endTime)
                          }
                        />
                        {itemWidth > 25 && (
                          <span className="truncate mx-3 md:mx-2">
                            {presetLabels[seg.preset] || seg.preset}
                          </span>
                        )}
                        <ResizeHandle
                          side="right"
                          isSelected={isSelected}
                          onMouseDown={(e) =>
                            handleDragStart(e, "segment", seg.id, "endTime", seg.startTime, seg.endTime)
                          }
                          onTouchStart={(e) =>
                            handleResizeTouchStart(e, "segment", seg.id, "endTime", seg.startTime, seg.endTime)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === CAPTIONS TRACK === */}
            <div
              className="flex items-center border-b border-[var(--border)]/30"
              style={{ height: TRACK_HEIGHT }}
            >
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{
                  width: HEADER_WIDTH,
                  position: "sticky",
                  left: 0,
                  zIndex: 5,
                }}
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
                    8
                  );
                  const isActive =
                    currentTime >= c.startTime && currentTime < c.endTime;
                  const isHovered = hoveredItem === `caption-${c.id}`;
                  const isSelected =
                    selectedItem?.type === "caption" &&
                    selectedItem.id === c.id;
                  const isMultiSel = multiSelected.has(makeKey("caption", c.id));
                  const isDraggingThis = activeDragId === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`absolute top-1 rounded-md border text-[8px] px-1 truncate flex items-center will-change-transform ${isMultiSel
                        ? "bg-[var(--accent)]/70 border-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/30 z-15 ring-2 ring-sky-400/70"
                        : isSelected
                        ? "bg-[var(--accent)]/80 border-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/40 z-20 ring-2 ring-white/40"
                        : isActive
                          ? "bg-[var(--accent)]/70 border-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/30 z-10"
                          : isHovered
                            ? "bg-[var(--accent)]/50 border-[var(--accent)]/80 text-white z-10"
                            : "bg-[var(--accent)]/30 border-[var(--accent)]/50 text-white/80"
                        } ${isDraggingThis ? "opacity-90 z-30 scale-y-110 shadow-lg ring-2 ring-[var(--accent)]" : "cursor-grab"}`}
                      style={{
                        left: c.startTime * pxPerSecond,
                        width: itemWidth,
                        height: TRACK_HEIGHT - 8,
                        transition: isDraggingThis
                          ? "none"
                          : "box-shadow 0.15s, opacity 0.15s",
                      }}
                      onMouseDown={(e) =>
                        handleDragStart(
                          e,
                          "caption",
                          c.id,
                          "move",
                          c.startTime,
                          c.endTime
                        )
                      }
                      onTouchStart={(e) =>
                        handleItemTouchStart(
                          e,
                          "caption",
                          c.id,
                          "move",
                          c.startTime,
                          c.endTime
                        )
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick("caption", c.id, e.shiftKey);
                      }}
                      onMouseEnter={() => setHoveredItem(`caption-${c.id}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <ResizeHandle
                        side="left"
                        isSelected={isSelected}
                        onMouseDown={(e) =>
                          handleDragStart(
                            e,
                            "caption",
                            c.id,
                            "startTime",
                            c.startTime,
                            c.endTime
                          )
                        }
                        onTouchStart={(e) =>
                          handleResizeTouchStart(
                            e,
                            "caption",
                            c.id,
                            "startTime",
                            c.startTime,
                            c.endTime
                          )
                        }
                      />
                      {itemWidth > 30 && (
                        <span className="truncate mx-3 md:mx-2">
                          {c.text}
                        </span>
                      )}
                      <ResizeHandle
                        side="right"
                        isSelected={isSelected}
                        onMouseDown={(e) =>
                          handleDragStart(
                            e,
                            "caption",
                            c.id,
                            "endTime",
                            c.startTime,
                            c.endTime
                          )
                        }
                        onTouchStart={(e) =>
                          handleResizeTouchStart(
                            e,
                            "caption",
                            c.id,
                            "endTime",
                            c.startTime,
                            c.endTime
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* === B-ROLL TRACK === */}
            <div
              className="flex items-center border-b border-[var(--border)]/30"
              style={{ height: TRACK_HEIGHT }}
            >
              <div
                className="shrink-0 px-2 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                style={{
                  width: HEADER_WIDTH,
                  position: "sticky",
                  left: 0,
                  zIndex: 5,
                }}
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
                    8
                  );
                  const isActive =
                    currentTime >= b.startTime && currentTime <= b.endTime;
                  const isHovered = hoveredItem === `broll-${b.id}`;
                  const isSelected =
                    selectedItem?.type === "broll" && selectedItem.id === b.id;
                  const isMultiSel = multiSelected.has(makeKey("broll", b.id));
                  const isDraggingThis = activeDragId === b.id;

                  return (
                    <div
                      key={b.id}
                      className={`absolute top-1 rounded-md border text-[8px] px-1 truncate flex items-center will-change-transform ${isMultiSel
                        ? "bg-orange-500/65 border-orange-400 text-white shadow-sm z-15 ring-2 ring-sky-400/70"
                        : isSelected
                        ? b.url
                          ? "bg-orange-500/80 border-orange-400 text-white shadow-md shadow-orange-500/40 z-20 ring-2 ring-white/40"
                          : "bg-gray-500/40 border-gray-400 border-dashed text-gray-300 z-20 ring-2 ring-white/40"
                        : b.url
                          ? isActive
                            ? "bg-orange-500/70 border-orange-400 text-white shadow-sm shadow-orange-500/30 z-10"
                            : isHovered
                              ? "bg-orange-500/55 border-orange-400/80 text-white z-10"
                              : "bg-orange-500/40 border-orange-400/60 text-orange-200"
                          : "bg-gray-500/20 border-gray-500/40 border-dashed text-gray-400"
                        } ${isDraggingThis ? "opacity-90 z-30 scale-y-110 shadow-lg ring-2 ring-orange-400" : "cursor-grab"}`}
                      style={{
                        left: b.startTime * pxPerSecond,
                        width: itemWidth,
                        height: TRACK_HEIGHT - 8,
                        transition: isDraggingThis
                          ? "none"
                          : "box-shadow 0.15s, opacity 0.15s",
                      }}
                      onMouseDown={(ev) =>
                        handleDragStart(
                          ev,
                          "broll",
                          b.id,
                          "move",
                          b.startTime,
                          b.endTime
                        )
                      }
                      onTouchStart={(ev) =>
                        handleItemTouchStart(
                          ev,
                          "broll",
                          b.id,
                          "move",
                          b.startTime,
                          b.endTime
                        )
                      }
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleItemClick("broll", b.id, ev.shiftKey);
                      }}
                      onMouseEnter={() => setHoveredItem(`broll-${b.id}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <ResizeHandle
                        side="left"
                        isSelected={isSelected}
                        onMouseDown={(ev) =>
                          handleDragStart(
                            ev,
                            "broll",
                            b.id,
                            "startTime",
                            b.startTime,
                            b.endTime
                          )
                        }
                        onTouchStart={(ev) =>
                          handleResizeTouchStart(
                            ev,
                            "broll",
                            b.id,
                            "startTime",
                            b.startTime,
                            b.endTime
                          )
                        }
                      />
                      {itemWidth > 30 && (
                        <span className={`truncate mx-3 md:mx-1.5 ${!b.url ? "animate-pulse" : ""}`}>
                          {b.url ? "B-Roll" : "Pende..."}
                        </span>
                      )}
                      <ResizeHandle
                        side="right"
                        isSelected={isSelected}
                        onMouseDown={(ev) =>
                          handleDragStart(
                            ev,
                            "broll",
                            b.id,
                            "endTime",
                            b.startTime,
                            b.endTime
                          )
                        }
                        onTouchStart={(ev) =>
                          handleResizeTouchStart(
                            ev,
                            "broll",
                            b.id,
                            "endTime",
                            b.startTime,
                            b.endTime
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* === EFFECTS TRACKS (by category) === */}
            {categorizedEffects.map((cat) => {
              const catHeight = Math.max(EFFECT_ROW_HEIGHT + 4, cat.rows.length * EFFECT_ROW_HEIGHT + 4);
              return (
                <div
                  key={cat.key}
                  className="flex border-b border-[var(--border)]/30"
                  style={{ height: catHeight }}
                >
                  <div
                    className="shrink-0 px-1.5 text-[8px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center h-full border-r border-[var(--border)] font-medium bg-[var(--surface)]"
                    style={{
                      width: HEADER_WIDTH,
                      position: "sticky",
                      left: 0,
                      zIndex: 5,
                    }}
                  >
                    {cat.label}
                  </div>
                  <div
                    className="relative h-full"
                    style={{ width: timelineWidth }}
                  >
                    {cat.rows.map((row: typeof effects, rowIndex: number) =>
                      row.map((e) => {
                        const color = getEffectColor(e.type);
                        const itemWidth = Math.max(
                          (e.endTime - e.startTime) * pxPerSecond,
                          8
                        );
                        const isActive =
                          currentTime >= e.startTime && currentTime <= e.endTime;
                        const isHovered = hoveredItem === `effect-${e.id}`;
                        const isSelected =
                          selectedItem?.type === "effect" &&
                          selectedItem.id === e.id;
                        const isMultiSel = multiSelected.has(makeKey("effect", e.id));
                        const isDraggingThis = activeDragId === e.id;

                        return (
                          <div
                            key={e.id}
                            className={`absolute rounded-md border text-[8px] px-1 truncate flex items-center will-change-transform ${color} ${isMultiSel
                              ? "brightness-125 shadow-sm z-15 ring-2 ring-sky-400/70"
                              : isSelected
                              ? "brightness-130 shadow-md z-20 ring-2 ring-white/40"
                              : isActive
                                ? "brightness-125 shadow-sm z-10"
                                : isHovered
                                  ? "brightness-115 z-10"
                                  : "hover:brightness-110"
                              } ${isDraggingThis ? "opacity-90 z-30 scale-y-110 shadow-lg ring-2 ring-white/50" : "cursor-grab"}`}
                            style={{
                              left: e.startTime * pxPerSecond,
                              width: itemWidth,
                              top: rowIndex * EFFECT_ROW_HEIGHT + 2,
                              height: EFFECT_ROW_HEIGHT - 4,
                              transition: isDraggingThis
                                ? "none"
                                : "box-shadow 0.15s, opacity 0.15s",
                            }}
                            onMouseDown={(ev) =>
                              handleDragStart(
                                ev,
                                "effect",
                                e.id,
                                "move",
                                e.startTime,
                                e.endTime
                              )
                            }
                            onTouchStart={(ev) =>
                              handleItemTouchStart(
                                ev,
                                "effect",
                                e.id,
                                "move",
                                e.startTime,
                                e.endTime
                              )
                            }
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleItemClick("effect", e.id, ev.shiftKey);
                            }}
                            onMouseEnter={() => setHoveredItem(`effect-${e.id}`)}
                            onMouseLeave={() => setHoveredItem(null)}
                          >
                            <ResizeHandle
                              side="left"
                              isSelected={isSelected}
                              onMouseDown={(ev) =>
                                handleDragStart(
                                  ev,
                                  "effect",
                                  e.id,
                                  "startTime",
                                  e.startTime,
                                  e.endTime
                                )
                              }
                              onTouchStart={(ev) =>
                                handleResizeTouchStart(
                                  ev,
                                  "effect",
                                  e.id,
                                  "startTime",
                                  e.startTime,
                                  e.endTime
                                )
                              }
                            />
                            {itemWidth > 40 && (
                              <span className="truncate mx-3 md:mx-1.5">
                                {e.type}
                              </span>
                            )}
                            <ResizeHandle
                              side="right"
                              isSelected={isSelected}
                              onMouseDown={(ev) =>
                                handleDragStart(
                                  ev,
                                  "effect",
                                  e.id,
                                  "endTime",
                                  e.startTime,
                                  e.endTime
                                )
                              }
                              onTouchStart={(ev) =>
                                handleResizeTouchStart(
                                  ev,
                                  "effect",
                                  e.id,
                                  "endTime",
                                  e.startTime,
                                  e.endTime
                                )
                              }
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="absolute z-30 group pointer-events-none"
              style={{
                left: HEADER_WIDTH + currentTime * pxPerSecond - 7,
                width: 14,
                top: 0,
                bottom: 0,
                willChange: "left",
              }}
            >
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                style={{ left: 6 }}
              />
              <div
                className={`absolute -top-1 w-4 h-4 md:w-3 md:h-3 rounded-full bg-red-500 shadow-md shadow-red-500/50 cursor-grab pointer-events-auto group-hover:scale-125 transition-transform ${dragState?.type === "playhead"
                  ? "scale-150 cursor-grabbing"
                  : ""
                  }`}
                style={{ left: 3 }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  pauseForDrag();
                  setDragState({
                    type: "playhead",
                    id: "playhead",
                    field: "move",
                    initialX: e.clientX,
                    initialStart: currentTime,
                    initialEnd: currentTime,
                  });
                }}
                onTouchStart={handlePlayheadTouchStart}
              />
              <div
                className="absolute top-0 bottom-0 w-full cursor-grab pointer-events-auto"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  pauseForDrag();
                  setDragState({
                    type: "playhead",
                    id: "playhead",
                    field: "move",
                    initialX: e.clientX,
                    initialStart: currentTime,
                    initialEnd: currentTime,
                  });
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
