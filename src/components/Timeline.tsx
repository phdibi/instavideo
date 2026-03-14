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

export default function Timeline() {
  const {
    videoDuration,
    currentTime,
    modeSegments,
    phraseCaptions,
    sfxMarkers,
    selectedItem,
    setCurrentTime,
    setIsPlaying,
    setSelectedItem,
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

      const handleMove = (ev: MouseEvent) => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = ev.clientX - rect.left + scroll.scrollLeft;
        setCurrentTime(pixelToTime(x));
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
    [pixelToTime, setCurrentTime]
  );

  // Generic edge drag for mode segments
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

  // Edge drag for phrase captions
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

  // Drag SFX marker horizontally
  const handleSFXMarkerDrag = useCallback(
    (e: React.MouseEvent, marker: SFXMarker) => {
      e.stopPropagation();
      setIsDraggingSFX(true);

      const handleMove = (ev: MouseEvent) => {
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
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.cursor = "grab";
      document.body.style.userSelect = "none";
    },
    [pixelToTime, updateSFXMarker]
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
              const isSelected = selectedItem?.id === seg.id;
              const color = getModeColor(seg.mode);

              return (
                <div
                  key={seg.id}
                  className={`absolute top-1 bottom-1 rounded-lg cursor-pointer group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-md"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 20),
                    backgroundColor: `${color}33`,
                    borderLeft: `3px solid ${color}`,
                  }}
                  onClick={() =>
                    setSelectedItem(
                      selectedItem?.id === seg.id ? null : { type: "segment", id: seg.id }
                    )
                  }
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
              const isSelected = selectedItem?.type === "phrase" && selectedItem.id === cap.id;

              return (
                <div
                  key={cap.id}
                  className={`absolute top-1 bottom-1 rounded-md cursor-pointer group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-sm"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 12),
                    backgroundColor: "rgba(255,255,255,0.12)",
                    borderLeft: "2px solid rgba(255,255,255,0.5)",
                  }}
                  onClick={() =>
                    setSelectedItem(
                      isSelected ? null : { type: "phrase", id: cap.id }
                    )
                  }
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
              const isSelected = selectedItem?.type === "segment" && selectedItem?.id === seg.id;
              const effectLabel = seg.brollEffect || "static";

              return (
                <div
                  key={`fx-${seg.id}`}
                  className={`absolute top-1 bottom-1 rounded-md cursor-pointer group transition-shadow ${
                    isSelected ? "ring-2 ring-white/60 shadow-lg" : "hover:shadow-sm"
                  }`}
                  style={{
                    left: left + LABEL_WIDTH,
                    width: Math.max(width, 20),
                    backgroundColor: "rgba(249,115,22,0.15)",
                    borderLeft: "2px solid rgba(249,115,22,0.6)",
                  }}
                  onClick={() =>
                    setSelectedItem(
                      selectedItem?.id === seg.id ? null : { type: "segment", id: seg.id }
                    )
                  }
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
              const isSelected = selectedItem?.type === "sfx" && selectedItem.id === marker.id;

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
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(
                      isSelected ? null : { type: "sfx", id: marker.id }
                    );
                  }}
                  onMouseDown={(e) => handleSFXMarkerDrag(e, marker)}
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
    >
      <div className={`absolute ${side === "left" ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-white/60`} />
    </div>
  );
}
