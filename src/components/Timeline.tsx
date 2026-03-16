"use client";

import { useRef, useCallback, useMemo, useState, useEffect, memo } from "react";
import { v4 as uuidv4 } from "uuid";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { getModeColor, getModeLabel } from "@/lib/modes";
import { SFX_LABELS } from "@/lib/sfx";
import { formatTime } from "@/lib/formatTime";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { ModeSegment, PhraseCaption, SFXMarker } from "@/types";

const DEFAULT_PPS = 60;
const MIN_PPS = 20;
const MAX_PPS = 200;
const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 40;
const TRACK_GAP = 2;
const LABEL_WIDTH = 72;
const DRAG_HANDLE_WIDTH = 14;
const EDGE_ZONE_MIN_PX = 16;

/** Detect if a click is near the left/right edge of an element */
function detectEdge(clientX: number, rect: DOMRect): "start" | "end" | null {
  const relX = clientX - rect.left;
  const zone = Math.min(Math.max(EDGE_ZONE_MIN_PX, rect.width * 0.22), rect.width / 2 - 2);
  if (relX <= zone) return "start";
  if (relX >= rect.width - zone) return "end";
  return null;
}

/** Convert a touch event to look like a mouse event for our drag handlers */
function touchToMouse(e: React.TouchEvent): React.MouseEvent | null {
  const touch = e.touches[0] || e.changedTouches[0];
  if (!touch) return null;
  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    stopPropagation: () => e.stopPropagation(),
    preventDefault: () => e.preventDefault(),
  } as unknown as React.MouseEvent;
}

export default function Timeline() {
  const {
    videoDuration,
    currentTime,
    modeSegments,
    phraseCaptions,
    sfxMarkers,
    selectedItems,
    setCurrentTime,
    setIsPlaying,
    setSelectedItem,
    toggleSelectedItem,
    updateModeSegment,
    updatePhraseCaption,
    addSFXMarker,
    updateSFXMarker,
    deleteModeSegment,
    splitSegmentForBroll,
  } = useProjectStore(useShallow((s) => ({
    videoDuration: s.videoDuration,
    currentTime: s.currentTime,
    modeSegments: s.modeSegments,
    phraseCaptions: s.phraseCaptions,
    sfxMarkers: s.sfxMarkers,
    selectedItems: s.selectedItems,
    setCurrentTime: s.setCurrentTime,
    setIsPlaying: s.setIsPlaying,
    setSelectedItem: s.setSelectedItem,
    toggleSelectedItem: s.toggleSelectedItem,
    updateModeSegment: s.updateModeSegment,
    updatePhraseCaption: s.updatePhraseCaption,
    addSFXMarker: s.addSFXMarker,
    updateSFXMarker: s.updateSFXMarker,
    deleteModeSegment: s.deleteModeSegment,
    splitSegmentForBroll: s.splitSegmentForBroll,
  })));

  const scrollRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PPS);
  const ppsRef = useRef(DEFAULT_PPS);

  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [dragEdge, setDragEdge] = useState<{
    id: string;
    track: "mode" | "caption";
    edge: "start" | "end";
  } | null>(null);
  const [isDraggingSFX, setIsDraggingSFX] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    segId: string;
    segMode: "presenter" | "broll";
    time: number;
  } | null>(null);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", handleClose);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClose);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  // Sync pps ref
  useEffect(() => { ppsRef.current = pixelsPerSecond; }, [pixelsPerSecond]);

  // Pinch-to-zoom on timeline
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let pinchStart: { dist: number; pps: number } | null = null;

    const getDist = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        pinchStart = { dist: getDist(e.touches), pps: ppsRef.current };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && pinchStart) {
        e.preventDefault();
        const ratio = getDist(e.touches) / pinchStart.dist;
        setPixelsPerSecond(Math.min(MAX_PPS, Math.max(MIN_PPS, pinchStart.pps * ratio)));
      }
    };

    const onTouchEnd = () => {
      pinchStart = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const totalWidth = Math.max(videoDuration * pixelsPerSecond, 300);

  const timeToX = useCallback(
    (t: number) => (t / (videoDuration || 1)) * totalWidth,
    [videoDuration, totalWidth]
  );

  const xToTime = useCallback(
    (x: number) => Math.max(0, Math.min((x / totalWidth) * (videoDuration || 1), videoDuration)),
    [videoDuration, totalWidth]
  );

  // Ruler markers — adapt interval to zoom level
  const rulerMarks = useMemo(() => {
    const marks: { time: number; x: number; label: string }[] = [];
    const niceIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const targetPixelGap = 80;
    const rawInterval = targetPixelGap / pixelsPerSecond;
    const interval = niceIntervals.find((v) => v >= rawInterval) ?? 60;
    for (let t = 0; t <= videoDuration; t += interval) {
      marks.push({ time: t, x: timeToX(t), label: formatTime(t) });
    }
    return marks;
  }, [videoDuration, timeToX, pixelsPerSecond]);

  // Separate captions: regular vs stanza
  const regularCaptions = useMemo(
    () => phraseCaptions.filter((c) => !c.stanzaId),
    [phraseCaptions]
  );
  const stanzaCaptions = useMemo(
    () => phraseCaptions.filter((c) => !!c.stanzaId),
    [phraseCaptions]
  );

  // Group stanzas by stanzaId (for shared background)
  const stanzaGroups = useMemo(() => {
    const groups: Record<string, PhraseCaption[]> = {};
    for (const cap of stanzaCaptions) {
      const key = cap.stanzaId!;
      (groups[key] ||= []).push(cap);
    }
    return groups;
  }, [stanzaCaptions]);

  // B-roll segments (for the effects track)
  const brollSegments = useMemo(
    () => modeSegments.filter((s) => s.mode === "broll"),
    [modeSegments]
  );

  /** Convert raw pixel position (from scroll container) to time, accounting for label offset */
  const pixelToTime = useCallback(
    (rawX: number) => xToTime(rawX - LABEL_WIDTH),
    [xToTime]
  );

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const x = e.clientX - rect.left + scroll.scrollLeft;
      setCurrentTime(pixelToTime(x));
      setIsPlaying(false);
    },
    [pixelToTime, setCurrentTime, setIsPlaying]
  );

  const handlePlayheadDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDraggingPlayhead(true);

      let rafId = 0;
      let pendingTime = -1;

      const flushTime = () => {
        rafId = 0;
        if (pendingTime >= 0) {
          setCurrentTime(pendingTime);
          pendingTime = -1;
        }
      };

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = clientX - rect.left + scroll.scrollLeft;
        pendingTime = pixelToTime(x);
        if (!rafId) rafId = requestAnimationFrame(flushTime);
      };

      const handleUp = () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (pendingTime >= 0) { setCurrentTime(pendingTime); pendingTime = -1; }
        setIsDraggingPlayhead(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [pixelToTime, setCurrentTime]
  );

  // Generic edge drag for mode segments — MOUSE ONLY
  const handleModeEdgeDrag = useCallback(
    (e: React.MouseEvent, seg: ModeSegment, edge: "start" | "end") => {
      e.stopPropagation();
      setDragEdge({ id: seg.id, track: "mode", edge });

      const handleMove = (ev: MouseEvent) => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);

        if (edge === "start") {
          updateModeSegment(seg.id, { startTime: Math.min(time, seg.endTime - 0.3) });
        } else {
          updateModeSegment(seg.id, { endTime: Math.max(time, seg.startTime + 0.3) });
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
    [pixelToTime, updateModeSegment]
  );

  // Edge touch for mode segments — long-press (300ms) to resize
  const handleModeEdgeTouch = useCallback(
    (e: React.TouchEvent, seg: ModeSegment, edge: "start" | "end") => {
      const touch = e.touches[0];
      if (!touch) return;

      const startX = touch.clientX;
      const startY = touch.clientY;
      let dragActivated = false;
      let cancelled = false;

      const longPressTimer = setTimeout(() => {
        if (cancelled) return;
        dragActivated = true;
        setDragEdge({ id: seg.id, track: "mode", edge });
        try { navigator.vibrate?.(50); } catch {}
      }, 300);

      const handleMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;

        if (!dragActivated) {
          if (Math.abs(t.clientX - startX) > 5 || Math.abs(t.clientY - startY) > 5) {
            cancelled = true;
            clearTimeout(longPressTimer);
            document.removeEventListener("touchmove", handleMove);
          }
          return;
        }

        ev.preventDefault();
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = t.clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);

        if (edge === "start") {
          updateModeSegment(seg.id, { startTime: Math.min(time, seg.endTime - 0.3) });
        } else {
          updateModeSegment(seg.id, { endTime: Math.max(time, seg.startTime + 0.3) });
        }
      };

      const handleEnd = () => {
        clearTimeout(longPressTimer);
        if (dragActivated) setDragEdge(null);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
      };

      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
    },
    [pixelToTime, updateModeSegment]
  );

  // Edge drag for phrase captions — MOUSE ONLY
  const handleCaptionEdgeDrag = useCallback(
    (e: React.MouseEvent, cap: PhraseCaption, edge: "start" | "end") => {
      e.stopPropagation();
      setDragEdge({ id: cap.id, track: "caption", edge });

      const handleMove = (ev: MouseEvent) => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);

        if (edge === "start") {
          updatePhraseCaption(cap.id, { startTime: Math.min(time, cap.endTime - 0.1) });
        } else {
          updatePhraseCaption(cap.id, { endTime: Math.max(time, cap.startTime + 0.1) });
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
    [pixelToTime, updatePhraseCaption]
  );

  // Edge touch for phrase captions — long-press (300ms) to resize
  const handleCaptionEdgeTouch = useCallback(
    (e: React.TouchEvent, cap: PhraseCaption, edge: "start" | "end") => {
      const touch = e.touches[0];
      if (!touch) return;

      const startX = touch.clientX;
      const startY = touch.clientY;
      let dragActivated = false;
      let cancelled = false;

      const longPressTimer = setTimeout(() => {
        if (cancelled) return;
        dragActivated = true;
        setDragEdge({ id: cap.id, track: "caption", edge });
        try { navigator.vibrate?.(50); } catch {}
      }, 300);

      const handleMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;

        if (!dragActivated) {
          if (Math.abs(t.clientX - startX) > 5 || Math.abs(t.clientY - startY) > 5) {
            cancelled = true;
            clearTimeout(longPressTimer);
            document.removeEventListener("touchmove", handleMove);
          }
          return;
        }

        ev.preventDefault();
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = t.clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);

        if (edge === "start") {
          updatePhraseCaption(cap.id, { startTime: Math.min(time, cap.endTime - 0.1) });
        } else {
          updatePhraseCaption(cap.id, { endTime: Math.max(time, cap.startTime + 0.1) });
        }
      };

      const handleEnd = () => {
        clearTimeout(longPressTimer);
        if (dragActivated) setDragEdge(null);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
      };

      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
    },
    [pixelToTime, updatePhraseCaption]
  );

  // Helper: check if item is in multi-selection
  const isItemSelected = useCallback(
    (type: string, id: string) =>
      selectedItems.some((i) => i.type === type && i.id === id),
    [selectedItems]
  );

  // Drag SFX marker horizontally — MOUSE ONLY
  const handleSFXMarkerDrag = useCallback(
    (e: React.MouseEvent, marker: SFXMarker) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const startClientX = e.clientX;
      const isCmd = e.metaKey || e.ctrlKey;
      let hasMoved = false;

      const handleMove = (ev: MouseEvent) => {
        if (!hasMoved && Math.abs(ev.clientX - startClientX) <= 3) return;
        if (!hasMoved) {
          hasMoved = true;
          setIsDraggingSFX(true);
          document.body.style.cursor = "grabbing";
        }

        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);
        updateSFXMarker(marker.id, { time });
      };

      const handleUp = () => {
        setIsDraggingSFX(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        if (!hasMoved) {
          const item = { type: "sfx" as const, id: marker.id };
          if (isCmd) {
            toggleSelectedItem(item);
          } else {
            setSelectedItem(isItemSelected("sfx", marker.id) ? null : item);
          }
        }
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.userSelect = "none";
    },
    [pixelToTime, updateSFXMarker, setSelectedItem, toggleSelectedItem, isItemSelected]
  );

  // Touch SFX marker — long-press (300ms) to drag, tap to select
  const handleSFXMarkerTouch = useCallback(
    (e: React.TouchEvent, marker: SFXMarker) => {
      const touch = e.touches[0];
      if (!touch) return;

      const startX = touch.clientX;
      const startY = touch.clientY;
      let dragActivated = false;
      let cancelled = false;

      const longPressTimer = setTimeout(() => {
        if (cancelled) return;
        dragActivated = true;
        setIsDraggingSFX(true);
        try { navigator.vibrate?.(50); } catch {}
      }, 300);

      const handleMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;

        if (!dragActivated) {
          if (Math.abs(t.clientX - startX) > 5 || Math.abs(t.clientY - startY) > 5) {
            cancelled = true;
            clearTimeout(longPressTimer);
            document.removeEventListener("touchmove", handleMove);
          }
          return;
        }

        ev.preventDefault();
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = t.clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);
        updateSFXMarker(marker.id, { time });
      };

      const handleEnd = () => {
        clearTimeout(longPressTimer);
        setIsDraggingSFX(false);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);

        if (!dragActivated && !cancelled) {
          const item = { type: "sfx" as const, id: marker.id };
          setSelectedItem(isItemSelected("sfx", marker.id) ? null : item);
        }
      };

      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
    },
    [pixelToTime, updateSFXMarker, setSelectedItem, isItemSelected]
  );

  // Body drag for mode segments (horizontal reposition) — MOUSE ONLY
  const handleSegmentBodyDrag = useCallback(
    (e: React.MouseEvent, seg: ModeSegment) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const startClientX = e.clientX;
      const isCmd = e.metaKey || e.ctrlKey;
      const duration = seg.endTime - seg.startTime;
      let hasMoved = false;

      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const startX = e.clientX - rect.left + scroll.scrollLeft;
      const offsetX = startX - (timeToX(seg.startTime) + LABEL_WIDTH);

      const handleMove = (ev: MouseEvent) => {
        if (!hasMoved && Math.abs(ev.clientX - startClientX) <= 3) return;
        hasMoved = true;
        document.body.style.cursor = "grabbing";

        const s = scrollRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const x = ev.clientX - r.left + s.scrollLeft;
        let newStart = pixelToTime(x - offsetX);
        let newEnd = newStart + duration;

        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > videoDuration) { newEnd = videoDuration; newStart = videoDuration - duration; }

        updateModeSegment(seg.id, { startTime: newStart, endTime: newEnd });
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (!hasMoved) {
          const item = { type: "segment" as const, id: seg.id };
          if (isCmd) {
            toggleSelectedItem(item);
          } else {
            setSelectedItem(isItemSelected("segment", seg.id) ? null : item);
          }
        }
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.userSelect = "none";
    },
    [pixelToTime, timeToX, videoDuration, updateModeSegment, setSelectedItem, toggleSelectedItem, isItemSelected]
  );

  // Body touch for mode segments — long-press (300ms) to drag, tap to select
  const handleSegmentBodyTouch = useCallback(
    (e: React.TouchEvent, seg: ModeSegment) => {
      const touch = e.touches[0];
      if (!touch) return;

      const startX = touch.clientX;
      const startY = touch.clientY;
      let dragActivated = false;
      let cancelled = false;

      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const sx = startX - rect.left + scroll.scrollLeft;
      const offsetX = sx - (timeToX(seg.startTime) + LABEL_WIDTH);
      const duration = seg.endTime - seg.startTime;

      const longPressTimer = setTimeout(() => {
        if (cancelled) return;
        dragActivated = true;
        try { navigator.vibrate?.(50); } catch {}
      }, 300);

      const handleMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;

        if (!dragActivated) {
          if (Math.abs(t.clientX - startX) > 5 || Math.abs(t.clientY - startY) > 5) {
            cancelled = true;
            clearTimeout(longPressTimer);
            document.removeEventListener("touchmove", handleMove);
          }
          return;
        }

        ev.preventDefault();
        const s = scrollRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const x = t.clientX - r.left + s.scrollLeft;
        let newStart = pixelToTime(x - offsetX);
        let newEnd = newStart + duration;
        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > videoDuration) { newEnd = videoDuration; newStart = videoDuration - duration; }
        updateModeSegment(seg.id, { startTime: newStart, endTime: newEnd });
      };

      const handleEnd = () => {
        clearTimeout(longPressTimer);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
        if (!dragActivated && !cancelled) {
          const item = { type: "segment" as const, id: seg.id };
          setSelectedItem(isItemSelected("segment", seg.id) ? null : item);
        }
      };

      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
    },
    [pixelToTime, timeToX, videoDuration, updateModeSegment, setSelectedItem, isItemSelected]
  );

  // Body drag for phrase captions — MOUSE ONLY
  const handleCaptionBodyDrag = useCallback(
    (e: React.MouseEvent, cap: PhraseCaption) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const startClientX = e.clientX;
      const isCmd = e.metaKey || e.ctrlKey;
      const duration = cap.endTime - cap.startTime;
      let hasMoved = false;

      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const startX = e.clientX - rect.left + scroll.scrollLeft;
      const offsetX = startX - (timeToX(cap.startTime) + LABEL_WIDTH);

      const handleMove = (ev: MouseEvent) => {
        if (!hasMoved && Math.abs(ev.clientX - startClientX) <= 3) return;
        hasMoved = true;
        document.body.style.cursor = "grabbing";

        const s = scrollRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const x = ev.clientX - r.left + s.scrollLeft;
        let newStart = pixelToTime(x - offsetX);
        let newEnd = newStart + duration;

        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > videoDuration) { newEnd = videoDuration; newStart = videoDuration - duration; }

        updatePhraseCaption(cap.id, { startTime: newStart, endTime: newEnd });
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (!hasMoved) {
          const item = { type: "phrase" as const, id: cap.id };
          if (isCmd) {
            toggleSelectedItem(item);
          } else {
            setSelectedItem(isItemSelected("phrase", cap.id) ? null : item);
          }
        }
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.userSelect = "none";
    },
    [pixelToTime, timeToX, videoDuration, updatePhraseCaption, setSelectedItem, toggleSelectedItem, isItemSelected]
  );

  // Body touch for phrase captions — long-press (300ms) to drag, tap to select
  const handleCaptionBodyTouch = useCallback(
    (e: React.TouchEvent, cap: PhraseCaption) => {
      const touch = e.touches[0];
      if (!touch) return;

      const startX = touch.clientX;
      const startY = touch.clientY;
      let dragActivated = false;
      let cancelled = false;

      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const sx = startX - rect.left + scroll.scrollLeft;
      const offsetX = sx - (timeToX(cap.startTime) + LABEL_WIDTH);
      const duration = cap.endTime - cap.startTime;

      const longPressTimer = setTimeout(() => {
        if (cancelled) return;
        dragActivated = true;
        try { navigator.vibrate?.(50); } catch {}
      }, 300);

      const handleMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;

        if (!dragActivated) {
          if (Math.abs(t.clientX - startX) > 5 || Math.abs(t.clientY - startY) > 5) {
            cancelled = true;
            clearTimeout(longPressTimer);
            document.removeEventListener("touchmove", handleMove);
          }
          return;
        }

        ev.preventDefault();
        const s = scrollRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const x = t.clientX - r.left + s.scrollLeft;
        let newStart = pixelToTime(x - offsetX);
        let newEnd = newStart + duration;
        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > videoDuration) { newEnd = videoDuration; newStart = videoDuration - duration; }
        updatePhraseCaption(cap.id, { startTime: newStart, endTime: newEnd });
      };

      const handleEnd = () => {
        clearTimeout(longPressTimer);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
        if (!dragActivated && !cancelled) {
          const item = { type: "phrase" as const, id: cap.id };
          setSelectedItem(isItemSelected("phrase", cap.id) ? null : item);
        }
      };

      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
    },
    [pixelToTime, timeToX, videoDuration, updatePhraseCaption, setSelectedItem, isItemSelected]
  );

  // Double-click on SFX track to add a new marker
  const handleSFXTrackDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const x = e.clientX - rect.left + scroll.scrollLeft;
      const time = pixelToTime(x);
      addSFXMarker({ id: uuidv4(), time, soundType: "impact" });
    },
    [pixelToTime, addSFXMarker]
  );

  const playheadX = timeToX(currentTime);
  const totalContentHeight = RULER_HEIGHT + (TRACK_HEIGHT + TRACK_GAP) * 5 + 8;

  const zoomIn = useCallback(() => {
    setPixelsPerSecond((prev) => Math.min(prev * 1.4, MAX_PPS));
  }, []);

  const zoomOut = useCallback(() => {
    setPixelsPerSecond((prev) => Math.max(prev / 1.4, MIN_PPS));
  }, []);

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-1 px-2 py-1 border-b border-[var(--border)] bg-[var(--surface)]">
        <button
          onClick={zoomOut}
          className="p-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
          title="Zoom out horizontal"
        >
          <ZoomOut className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        </button>
        <span className="text-[9px] text-[var(--text-secondary)] min-w-[32px] text-center">
          {Math.round(pixelsPerSecond / DEFAULT_PPS * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
          title="Zoom in horizontal"
        >
          <ZoomIn className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative select-none"
        style={{ WebkitTouchCallout: "none", touchAction: "pan-x pan-y" } as React.CSSProperties}
      >
        <div style={{ width: totalWidth + LABEL_WIDTH + 40, minHeight: totalContentHeight }} className="relative">
          {/* ═══ Ruler ═══ */}
          <div
            className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] cursor-pointer"
            style={{ height: RULER_HEIGHT, paddingLeft: LABEL_WIDTH }}
            onClick={handleRulerClick}
            onTouchStart={(e) => { e.preventDefault(); const m = touchToMouse(e); if (m) handleRulerClick(m); }}
          >
            {rulerMarks.map((mark) => (
              <div
                key={mark.time}
                className="absolute top-0 bottom-0 flex flex-col items-center"
                style={{ left: mark.x + LABEL_WIDTH }}
              >
                <div className="w-px h-2 bg-[var(--text-secondary)]/30" />
                <span className="text-[9px] text-[var(--text-secondary)]/60 mt-0.5 select-none">
                  {mark.label}
                </span>
              </div>
            ))}
          </div>

          {/* ═══ Track 1: Modo ═══ */}
          <div className="relative" style={{ height: TRACK_HEIGHT, marginTop: TRACK_GAP }}>
            <TrackLabel label="Modo" />
            {modeSegments.map((seg) => {
              const left = timeToX(seg.startTime);
              const width = timeToX(seg.endTime) - left;
              const isSelected = isItemSelected("segment", seg.id);
              const color = getModeColor(seg.mode);

              return (
                <div
                  key={seg.id}
                  className={`absolute top-1 bottom-1 rounded-lg group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-md"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 20),
                    backgroundColor: `${color}33`,
                    borderLeft: `3px solid ${color}`,
                    cursor: "grab",
                  }}
                  onMouseMove={(e) => {
                    if (document.body.style.cursor) return; // skip during active drag
                    const edge = detectEdge(e.clientX, e.currentTarget.getBoundingClientRect());
                    e.currentTarget.style.cursor = edge ? "col-resize" : "grab";
                  }}
                  onMouseLeave={(e) => {
                    if (!document.body.style.cursor) e.currentTarget.style.cursor = "grab";
                  }}
                  onMouseDown={(e) => {
                    const edge = detectEdge(e.clientX, e.currentTarget.getBoundingClientRect());
                    if (edge) {
                      handleModeEdgeDrag(e, seg, edge);
                    } else {
                      handleSegmentBodyDrag(e, seg);
                    }
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (!touch) return;
                    const edge = detectEdge(touch.clientX, e.currentTarget.getBoundingClientRect());
                    if (edge) {
                      handleModeEdgeTouch(e, seg, edge);
                    } else {
                      handleSegmentBodyTouch(e, seg);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (seg.mode === "typography") return;
                    e.preventDefault();
                    const scroll = scrollRef.current;
                    if (!scroll) return;
                    const rect = scroll.getBoundingClientRect();
                    const x = e.clientX - rect.left + scroll.scrollLeft;
                    const clickTime = pixelToTime(x);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      segId: seg.id,
                      segMode: seg.mode as "presenter" | "broll",
                      time: clickTime,
                    });
                  }}
                >
                  <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
                    <span className="text-[10px] font-semibold truncate" style={{ color }}>
                      {getModeLabel(seg.mode)}
                      {seg.mode === "broll" && seg.brollQuery ? `: ${seg.brollQuery}` : ""}
                      {seg.mode === "typography" && seg.typographyText ? `: ${seg.typographyText}` : ""}
                    </span>
                  </div>
                  {/* Visual edge indicators (no event handlers) */}
                  <div className="absolute left-0 top-0 bottom-0 flex items-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: DRAG_HANDLE_WIDTH }}>
                    <div className="ml-0.5 w-1 h-5 rounded-full bg-white/70" />
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: DRAG_HANDLE_WIDTH }}>
                    <div className="mr-0.5 w-1 h-5 rounded-full bg-white/70" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ═══ Track 2: Legendas (regular only) ═══ */}
          <div className="relative" style={{ height: TRACK_HEIGHT, marginTop: TRACK_GAP }}>
            <TrackLabel label="Legendas" />
            {regularCaptions.map((cap) => {
              const left = timeToX(cap.startTime);
              const width = timeToX(cap.endTime) - left;
              const isSelected = isItemSelected("phrase", cap.id);

              return (
                <div
                  key={cap.id}
                  className={`absolute top-1 bottom-1 rounded-md cursor-grab group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-sm"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 12),
                    backgroundColor: "rgba(255,255,255,0.12)",
                    borderLeft: "2px solid rgba(255,255,255,0.5)",
                  }}
                  onMouseDown={(e) => handleCaptionBodyDrag(e, cap)}
                  onTouchStart={(e) => handleCaptionBodyTouch(e, cap)}
                >
                  <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                    <span className="text-[9px] text-white/80 truncate font-medium">
                      {cap.text}
                    </span>
                  </div>
                  <EdgeHandle side="left" onMouseDown={(e) => handleCaptionEdgeDrag(e, cap, "start")} onTouchStart={(e) => handleCaptionEdgeTouch(e, cap, "start")} />
                  <EdgeHandle side="right" onMouseDown={(e) => handleCaptionEdgeDrag(e, cap, "end")} onTouchStart={(e) => handleCaptionEdgeTouch(e, cap, "end")} />
                </div>
              );
            })}
          </div>

          {/* ═══ Track 3: Estrofes (stanza captions) ═══ */}
          <div className="relative" style={{ height: TRACK_HEIGHT, marginTop: TRACK_GAP }}>
            <TrackLabel label="Estrofes" />
            {/* Group backgrounds */}
            {Object.entries(stanzaGroups).map(([stanzaId, caps]) => {
              const minStart = Math.min(...caps.map((c) => c.startTime));
              const maxEnd = Math.max(...caps.map((c) => c.endTime));
              const left = timeToX(minStart);
              const width = timeToX(maxEnd) - left;
              return (
                <div
                  key={`stanza-bg-${stanzaId}`}
                  className="absolute top-0.5 bottom-0.5 pointer-events-none"
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 12),
                    backgroundColor: "rgba(139,92,246,0.08)",
                    borderRadius: 6,
                  }}
                />
              );
            })}
            {/* Individual stanza words */}
            {stanzaCaptions.map((cap) => {
              const left = timeToX(cap.startTime);
              const width = timeToX(cap.endTime) - left;
              const isSelected = isItemSelected("phrase", cap.id);
              const isEmphasis = !!cap.isEmphasis;

              return (
                <div
                  key={cap.id}
                  className={`absolute top-1 bottom-1 rounded-md cursor-grab group transition-shadow ${
                    isSelected ? "ring-2 ring-purple-300/60 shadow-lg" : "hover:shadow-sm"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 12),
                    backgroundColor: isEmphasis
                      ? "rgba(139,92,246,0.30)"
                      : "rgba(139,92,246,0.15)",
                    borderLeft: isEmphasis
                      ? "3px solid rgba(139,92,246,0.9)"
                      : "2px solid rgba(139,92,246,0.5)",
                  }}
                  onMouseDown={(e) => handleCaptionBodyDrag(e, cap)}
                  onTouchStart={(e) => handleCaptionBodyTouch(e, cap)}
                >
                  <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                    <span
                      className={`text-[9px] truncate ${
                        isEmphasis
                          ? "text-purple-200 font-bold"
                          : "text-purple-300/80 font-medium"
                      }`}
                    >
                      {isEmphasis ? "✦ " : ""}{cap.text}
                    </span>
                  </div>
                  <EdgeHandle side="left" onMouseDown={(e) => handleCaptionEdgeDrag(e, cap, "start")} onTouchStart={(e) => handleCaptionEdgeTouch(e, cap, "start")} />
                  <EdgeHandle side="right" onMouseDown={(e) => handleCaptionEdgeDrag(e, cap, "end")} onTouchStart={(e) => handleCaptionEdgeTouch(e, cap, "end")} />
                </div>
              );
            })}
          </div>

          {/* ═══ Track 4: Efeitos (B-Roll effects) ═══ */}
          <div className="relative" style={{ height: TRACK_HEIGHT, marginTop: TRACK_GAP }}>
            <TrackLabel label="Efeitos" />
            {brollSegments.map((seg) => {
              const left = timeToX(seg.startTime);
              const width = timeToX(seg.endTime) - left;
              const isSelected = isItemSelected("segment", seg.id);
              const effectLabel = seg.brollEffect || "static";

              return (
                <div
                  key={`fx-${seg.id}`}
                  className={`absolute top-1 bottom-1 rounded-md cursor-grab group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-sm"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 20),
                    backgroundColor: "rgba(249,115,22,0.15)",
                    borderLeft: "2px solid rgba(249,115,22,0.6)",
                  }}
                  onMouseDown={(e) => handleSegmentBodyDrag(e, seg)}
                  onTouchStart={(e) => handleSegmentBodyTouch(e, seg)}
                >
                  <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                    <span className="text-[9px] text-orange-400/80 truncate font-medium">
                      {effectLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ═══ Track 5: Sons (SFX Markers) ═══ */}
          <div
            className="relative"
            style={{ height: TRACK_HEIGHT, marginTop: TRACK_GAP }}
            onDoubleClick={handleSFXTrackDoubleClick}
          >
            <TrackLabel label="Sons" />
            {sfxMarkers.length === 0 && (
              <div
                className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                style={{ left: LABEL_WIDTH + 16 }}
              >
                <span className="text-[9px] text-[var(--text-secondary)]/40 italic select-none">
                  Duplo-clique para adicionar som
                </span>
              </div>
            )}
            {sfxMarkers.map((marker) => {
              const x = timeToX(marker.time);
              const isSelected = isItemSelected("sfx", marker.id);

              return (
                <div
                  key={marker.id}
                  className={`absolute top-1 cursor-grab group ${
                    isSelected ? "z-10" : ""
                  }`}
                  style={{
                    left: x + LABEL_WIDTH - 7,
                    width: 14,
                    height: TRACK_HEIGHT - 8,
                  }}
                  title={`${SFX_LABELS[marker.soundType]} — ${marker.time.toFixed(1)}s`}
                  onMouseDown={(e) => handleSFXMarkerDrag(e, marker)}
                  onTouchStart={(e) => handleSFXMarkerTouch(e, marker)}
                >
                  <div
                    className={`w-3.5 h-3.5 rotate-45 mx-auto mt-2 transition-all ${
                      isSelected
                        ? "bg-yellow-400 ring-2 ring-white/60 shadow-lg"
                        : "bg-yellow-500/70 group-hover:bg-yellow-400/90"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* ═══ Playhead ═══ */}
          <div
            className="absolute z-30 cursor-col-resize"
            style={{
              left: playheadX + LABEL_WIDTH,
              top: 0,
              bottom: 0,
              width: 2,
            }}
            onMouseDown={handlePlayheadDragStart}
            onTouchStart={(e) => { e.preventDefault(); const m = touchToMouse(e); if (m) handlePlayheadDragStart(m); }}
          >
            <div className="absolute inset-0 bg-red-500" />
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-md" />
          </div>
        </div>
      </div>

      {/* ═══ Context Menu ═══ */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.segMode === "presenter" && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
              onClick={() => {
                splitSegmentForBroll(contextMenu.segId, contextMenu.time);
                setContextMenu(null);
              }}
            >
              Adicionar B-Roll aqui
            </button>
          )}
          {contextMenu.segMode === "broll" && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
              onClick={() => {
                deleteModeSegment(contextMenu.segId);
                setContextMenu(null);
              }}
            >
              Remover B-Roll
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Track label on the left side */
const TrackLabel = memo(function TrackLabel({ label }: { label: string }) {
  return (
    <div className="absolute left-0 top-0 bottom-0 bg-[var(--surface)] border-r border-[var(--border)] flex items-center justify-center z-10" style={{ width: LABEL_WIDTH }}>
      <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
});

/** Edge drag handle for resizing segments/captions */
const EdgeHandle = memo(function EdgeHandle({
  side,
  onMouseDown,
  onTouchStart,
}: {
  side: "left" | "right";
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
}) {
  return (
    <div
      className={`absolute ${side === "left" ? "left-0" : "right-0"} top-0 bottom-0 cursor-col-resize opacity-100 md:opacity-40 md:hover:opacity-100 md:group-hover:opacity-100 transition-opacity`}
      style={{ width: DRAG_HANDLE_WIDTH }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className={`absolute ${side === "left" ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full bg-white/80`} />
    </div>
  );
});
