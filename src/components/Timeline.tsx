"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useProjectStore } from "@/store/useProjectStore";
import { getModeColor, getModeLabel } from "@/lib/modes";
import { SFX_LABELS } from "@/lib/sfx";
import { formatTime } from "@/lib/formatTime";
import type { ModeSegment, PhraseCaption, SFXMarker } from "@/types";

const PIXELS_PER_SECOND = 60;
const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 40;
const TRACK_GAP = 2;
const LABEL_WIDTH = 72;
const DRAG_HANDLE_WIDTH = 6;

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
  } = useProjectStore();

  const scrollRef = useRef<HTMLDivElement>(null);
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

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = clientX - rect.left + scroll.scrollLeft;
        setCurrentTime(pixelToTime(x));
      };

      const handleUp = () => {
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

  // Generic edge drag for mode segments
  const handleModeEdgeDrag = useCallback(
    (e: React.MouseEvent, seg: ModeSegment, edge: "start" | "end") => {
      e.stopPropagation();
      setDragEdge({ id: seg.id, track: "mode", edge });

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        if ("touches" in ev) ev.preventDefault();
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = clientX - rect.left + scroll.scrollLeft;
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
    [pixelToTime, updateModeSegment]
  );

  // Edge drag for phrase captions
  const handleCaptionEdgeDrag = useCallback(
    (e: React.MouseEvent, cap: PhraseCaption, edge: "start" | "end") => {
      e.stopPropagation();
      setDragEdge({ id: cap.id, track: "caption", edge });

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        if ("touches" in ev) ev.preventDefault();
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = clientX - rect.left + scroll.scrollLeft;
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
    [pixelToTime, updatePhraseCaption]
  );

  // Helper: check if item is in multi-selection
  const isItemSelected = useCallback(
    (type: string, id: string) =>
      selectedItems.some((i) => i.type === type && i.id === id),
    [selectedItems]
  );

  // Drag SFX marker horizontally (with 3px threshold to distinguish click vs drag)
  const handleSFXMarkerDrag = useCallback(
    (e: React.MouseEvent, marker: SFXMarker) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const startClientX = e.clientX;
      const isCmd = e.metaKey || e.ctrlKey;
      let hasMoved = false;

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        if ("touches" in ev) ev.preventDefault();
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        if (!hasMoved && Math.abs(clientX - startClientX) <= 3) return;
        if (!hasMoved) {
          hasMoved = true;
          setIsDraggingSFX(true);
          document.body.style.cursor = "grabbing";
        }

        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = clientX - rect.left + scroll.scrollLeft;
        const time = pixelToTime(x);
        updateSFXMarker(marker.id, { time });
      };

      const handleUp = () => {
        setIsDraggingSFX(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        if (!hasMoved) {
          // It was a click, not a drag
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
      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleUp);
      document.body.style.userSelect = "none";
    },
    [pixelToTime, updateSFXMarker, setSelectedItem, toggleSelectedItem, isItemSelected]
  );

  // Body drag for mode segments (horizontal reposition)
  const handleSegmentBodyDrag = useCallback(
    (e: React.MouseEvent, seg: ModeSegment) => {
      if (e.button !== 0) return; // left-click only
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

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        if ("touches" in ev) ev.preventDefault();
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        if (!hasMoved && Math.abs(clientX - startClientX) <= 3) return;
        hasMoved = true;
        document.body.style.cursor = "grabbing";

        const s = scrollRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const x = clientX - r.left + s.scrollLeft;
        let newStart = pixelToTime(x - offsetX);
        let newEnd = newStart + duration;

        // Clamp
        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > videoDuration) { newEnd = videoDuration; newStart = videoDuration - duration; }

        updateModeSegment(seg.id, { startTime: newStart, endTime: newEnd });
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleUp);
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
      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleUp);
      document.body.style.userSelect = "none";
    },
    [pixelToTime, timeToX, videoDuration, updateModeSegment, setSelectedItem, toggleSelectedItem, isItemSelected]
  );

  // Body drag for phrase captions
  const handleCaptionBodyDrag = useCallback(
    (e: React.MouseEvent, cap: PhraseCaption) => {
      if (e.button !== 0) return; // left-click only
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

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        if ("touches" in ev) ev.preventDefault();
        const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        if (!hasMoved && Math.abs(clientX - startClientX) <= 3) return;
        hasMoved = true;
        document.body.style.cursor = "grabbing";

        const s = scrollRef.current;
        if (!s) return;
        const r = s.getBoundingClientRect();
        const x = clientX - r.left + s.scrollLeft;
        let newStart = pixelToTime(x - offsetX);
        let newEnd = newStart + duration;

        if (newStart < 0) { newStart = 0; newEnd = duration; }
        if (newEnd > videoDuration) { newEnd = videoDuration; newStart = videoDuration - duration; }

        updatePhraseCaption(cap.id, { startTime: newStart, endTime: newEnd });
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleUp);
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
      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleUp);
      document.body.style.userSelect = "none";
    },
    [pixelToTime, timeToX, videoDuration, updatePhraseCaption, setSelectedItem, toggleSelectedItem, isItemSelected]
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
  const totalContentHeight = RULER_HEIGHT + (TRACK_HEIGHT + TRACK_GAP) * 4 + 8;

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative"
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
                  className={`absolute top-1 bottom-1 rounded-lg cursor-grab group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-md"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 20),
                    backgroundColor: `${color}33`,
                    borderLeft: `3px solid ${color}`,
                  }}
                  onMouseDown={(e) => handleSegmentBodyDrag(e, seg)}
                  onTouchStart={(e) => { e.preventDefault(); const m = touchToMouse(e); if (m) handleSegmentBodyDrag(m, seg); }}
                  onContextMenu={(e) => {
                    if (seg.mode === "typography") return; // no context menu for typography
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
                  <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                    <span className="text-[10px] font-semibold truncate" style={{ color }}>
                      {getModeLabel(seg.mode)}
                      {seg.mode === "broll" && seg.brollQuery ? `: ${seg.brollQuery}` : ""}
                      {seg.mode === "typography" && seg.typographyText ? `: ${seg.typographyText}` : ""}
                    </span>
                  </div>
                  <EdgeHandle side="left" onMouseDown={(e) => handleModeEdgeDrag(e, seg, "start")} />
                  <EdgeHandle side="right" onMouseDown={(e) => handleModeEdgeDrag(e, seg, "end")} />
                </div>
              );
            })}
          </div>

          {/* ═══ Track 2: Legendas ═══ */}
          <div className="relative" style={{ height: TRACK_HEIGHT, marginTop: TRACK_GAP }}>
            <TrackLabel label="Legendas" />
            {phraseCaptions.map((cap) => {
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
                  onTouchStart={(e) => { e.preventDefault(); const m = touchToMouse(e); if (m) handleCaptionBodyDrag(m, cap); }}
                >
                  <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                    <span className="text-[9px] text-white/80 truncate font-medium">
                      {cap.text}
                    </span>
                  </div>
                  <EdgeHandle side="left" onMouseDown={(e) => handleCaptionEdgeDrag(e, cap, "start")} />
                  <EdgeHandle side="right" onMouseDown={(e) => handleCaptionEdgeDrag(e, cap, "end")} />
                </div>
              );
            })}
          </div>

          {/* ═══ Track 3: Efeitos (B-Roll effects) ═══ */}
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
                  onTouchStart={(e) => { e.preventDefault(); const m = touchToMouse(e); if (m) handleSegmentBodyDrag(m, seg); }}
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

          {/* ═══ Track 4: Sons (SFX Markers) ═══ */}
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
                  onTouchStart={(e) => { e.preventDefault(); const m = touchToMouse(e); if (m) handleSFXMarkerDrag(m, marker); }}
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
function TrackLabel({ label }: { label: string }) {
  return (
    <div className="absolute left-0 top-0 bottom-0 bg-[var(--surface)] border-r border-[var(--border)] flex items-center justify-center z-10" style={{ width: LABEL_WIDTH }}>
      <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

/** Edge drag handle for resizing segments/captions */
function EdgeHandle({
  side,
  onMouseDown,
}: {
  side: "left" | "right";
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`absolute ${side === "left" ? "left-0" : "right-0"} top-0 bottom-0 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity`}
      style={{ width: DRAG_HANDLE_WIDTH }}
      onMouseDown={onMouseDown}
      onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); const m = touchToMouse(e); if (m) onMouseDown(m); }}
    >
      <div className={`absolute ${side === "left" ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-white/60`} />
    </div>
  );
}
