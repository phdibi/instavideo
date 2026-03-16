"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Film } from "lucide-react";
import VideoPreview from "./VideoPreview";
import MusicController from "./MusicController";
import EditingToolbar, { type ToolbarCategory } from "./EditingToolbar";
import Timeline from "./Timeline";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";

const MIN_TIMELINE_HEIGHT = 100;
const MAX_TIMELINE_HEIGHT = 500;
const DEFAULT_TIMELINE_HEIGHT = 200;

export default function EditorLayout() {
  const { reset, modeSegments, selectedItem } = useProjectStore(
    useShallow((s) => ({ reset: s.reset, modeSegments: s.modeSegments, selectedItem: s.selectedItem }))
  );
  const [activeCategory, setActiveCategory] = useState<ToolbarCategory | null>(null);
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Auto-switch toolbar when selecting items (only on selection change, not segment updates)
  useEffect(() => {
    if (selectedItem?.type === "segment") {
      const seg = useProjectStore.getState().modeSegments.find((s) => s.id === selectedItem.id);
      if (seg?.mode === "broll" || seg?.mode === "presenter") {
        setActiveCategory("broll");
      }
    }
    // Note: phrase selection no longer auto-switches to stanzas tab
    // so users can edit per-phrase styles in the captions panel
  }, [selectedItem]);

  // Cleanup drag styles on unmount
  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, []);

  // Timeline resize handler (mouse — desktop)
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = timelineHeight;

      const handleMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const deltaY = startYRef.current - ev.clientY;
        const newHeight = Math.min(
          MAX_TIMELINE_HEIGHT,
          Math.max(MIN_TIMELINE_HEIGHT, startHeightRef.current + deltaY)
        );
        setTimelineHeight(newHeight);
      };

      const handleUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [timelineHeight]
  );

  // Timeline resize handler (touch — mobile)
  const handleTouchResizeStart = useCallback(
    (e: React.TouchEvent) => {
      isDraggingRef.current = true;
      startYRef.current = e.touches[0].clientY;
      startHeightRef.current = timelineHeight;
    },
    [timelineHeight]
  );

  const handleTouchResizeMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const deltaY = startYRef.current - e.touches[0].clientY;
    const newHeight = Math.min(
      MAX_TIMELINE_HEIGHT,
      Math.max(MIN_TIMELINE_HEIGHT, startHeightRef.current + deltaY)
    );
    setTimelineHeight(newHeight);
  }, []);

  const handleTouchResizeEnd = useCallback(() => {
    isDraggingRef.current = false;
    // Snap to nearest preset
    setTimelineHeight((prev) => {
      if (prev < 130) return MIN_TIMELINE_HEIGHT;
      if (prev < 250) return DEFAULT_TIMELINE_HEIGHT;
      if (prev < 400) return 350;
      return MAX_TIMELINE_HEIGHT;
    });
  }, []);

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="h-12 bg-[var(--surface)] border-b border-[var(--border)] flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={reset}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          title="Novo projeto"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-[var(--accent-light)]" />
          <span className="font-semibold text-sm">CineAI Editor</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span className="hidden sm:inline">{modeSegments.length} segmentos</span>
        </div>
      </header>

      {/* Music controller (invisible, handles audio) */}
      <MusicController />

      {/* Video Preview (flex-1) */}
      <div className="flex-1 min-h-[200px]">
        <VideoPreview />
      </div>

      {/* Editing Toolbar (slide-up panels + icon bar) */}
      <EditingToolbar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Timeline resize handle + Timeline — hidden when panel is open */}
      {activeCategory === null && (
        <>
          <div
            className="h-2.5 bg-[var(--surface)] border-t border-[var(--border)] cursor-row-resize hover:bg-[var(--accent)]/20 active:bg-[var(--accent)]/30 transition-colors flex items-center justify-center shrink-0 group touch-none"
            onMouseDown={handleResizeStart}
            onTouchStart={handleTouchResizeStart}
            onTouchMove={handleTouchResizeMove}
            onTouchEnd={handleTouchResizeEnd}
          >
            <div className="w-8 h-0.5 rounded-full bg-[var(--text-secondary)]/30 group-hover:bg-[var(--accent)]/60 transition-colors" />
          </div>
          <div className="shrink-0" style={{ height: timelineHeight }}>
            <Timeline />
          </div>
        </>
      )}
    </div>
  );
}
