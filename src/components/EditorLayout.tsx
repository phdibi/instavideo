"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Type,
  Sparkles,
  Image as ImageIcon,
  Download,
  ArrowLeft,
  Film,
  GripHorizontal,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import VideoPreview from "./VideoPreview";
import CaptionEditor from "./CaptionEditor";
import EffectsEditor from "./EffectsEditor";
import BRollPanel from "./BRollPanel";
import ExportPanel from "./ExportPanel";
import Timeline from "./Timeline";
import { useProjectStore } from "@/store/useProjectStore";

type Tab = "captions" | "effects" | "broll" | "export";

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "captions", label: "Legendas", icon: <Type className="w-4 h-4" /> },
  {
    key: "effects",
    label: "Efeitos",
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    key: "broll",
    label: "B-Roll",
    icon: <ImageIcon className="w-4 h-4" />,
  },
  {
    key: "export",
    label: "Exportar",
    icon: <Download className="w-4 h-4" />,
  },
];

const MIN_TIMELINE_HEIGHT = 100;
const MAX_TIMELINE_HEIGHT = 500;
const DEFAULT_TIMELINE_HEIGHT = 200;

// Mobile panel height presets (percentage of available space)
const MOBILE_PANEL_COLLAPSED = 0; // Panel hidden
const MOBILE_PANEL_HALF = 60; // Panel takes ~60% of area — large enough to edit comfortably
const MOBILE_PANEL_FULL = 92; // Panel nearly fullscreen

// Mobile timeline height presets (pixels)
const MOBILE_TIMELINE_COMPACT = 80;   // Minimal — just see track headers
const MOBILE_TIMELINE_DEFAULT = 140;  // Default — comfortable viewing
const MOBILE_TIMELINE_EXPANDED = 260; // Expanded — full editing mode
const MOBILE_TIMELINE_MAX = 380;      // Maximum — nearly half screen

export default function EditorLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("captions");
  const { reset, captions, effects, selectedItem } = useProjectStore();
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Mobile: panel height as percentage (0 = collapsed, 55 = half, 90 = full)
  const [mobilePanelPercent, setMobilePanelPercent] = useState(MOBILE_PANEL_COLLAPSED);
  const mobileDragRef = useRef(false);
  const mobileDragStartYRef = useRef(0);
  const mobileDragStartPercentRef = useRef(0);
  const mobileContentRef = useRef<HTMLDivElement>(null);

  // Mobile: timeline height (pixels) — resizable
  const [mobileTimelineHeight, setMobileTimelineHeight] = useState(MOBILE_TIMELINE_DEFAULT);
  const timelineDragRef = useRef(false);
  const timelineDragStartYRef = useRef(0);
  const timelineDragStartHeightRef = useRef(0);

  const mobilePanelOpen = mobilePanelPercent > 0;

  // Auto-switch sidebar tab when an item is selected from the timeline
  useEffect(() => {
    if (!selectedItem) return;
    const tabMap: Record<string, Tab> = {
      caption: "captions",
      effect: "effects",
      broll: "broll",
    };
    const targetTab = tabMap[selectedItem.type];
    if (targetTab) {
      setActiveTab(targetTab);
      // Auto-expand panel on mobile when selecting from timeline
      if (mobilePanelPercent === MOBILE_PANEL_COLLAPSED) {
        setMobilePanelPercent(MOBILE_PANEL_HALF);
      }
    }
  }, [selectedItem]);

  // Mobile panel drag handler (touch)
  const handleMobilePanelDragStart = useCallback(
    (e: React.TouchEvent) => {
      mobileDragRef.current = true;
      mobileDragStartYRef.current = e.touches[0].clientY;
      mobileDragStartPercentRef.current = mobilePanelPercent;
    },
    [mobilePanelPercent]
  );

  const handleMobilePanelDragMove = useCallback(
    (e: React.TouchEvent) => {
      if (!mobileDragRef.current) return;
      const container = mobileContentRef.current;
      if (!container) return;

      const deltaY = mobileDragStartYRef.current - e.touches[0].clientY;
      const containerHeight = container.getBoundingClientRect().height;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPercent = Math.min(
        MOBILE_PANEL_FULL,
        Math.max(0, mobileDragStartPercentRef.current + deltaPercent)
      );
      setMobilePanelPercent(newPercent);
    },
    []
  );

  const handleMobilePanelDragEnd = useCallback(() => {
    mobileDragRef.current = false;
    // Snap to nearest preset
    setMobilePanelPercent((prev) => {
      if (prev < 20) return MOBILE_PANEL_COLLAPSED;
      if (prev < 72) return MOBILE_PANEL_HALF;
      return MOBILE_PANEL_FULL;
    });
  }, []);

  // Mobile timeline drag handler (touch) — drag the handle UP to expand, DOWN to collapse
  const handleTimelineDragStart = useCallback(
    (e: React.TouchEvent) => {
      timelineDragRef.current = true;
      timelineDragStartYRef.current = e.touches[0].clientY;
      timelineDragStartHeightRef.current = mobileTimelineHeight;
    },
    [mobileTimelineHeight]
  );

  const handleTimelineDragMove = useCallback(
    (e: React.TouchEvent) => {
      if (!timelineDragRef.current) return;
      // Dragging UP (negative deltaY) = increase height
      const deltaY = timelineDragStartYRef.current - e.touches[0].clientY;
      const newHeight = Math.min(
        MOBILE_TIMELINE_MAX,
        Math.max(MOBILE_TIMELINE_COMPACT, timelineDragStartHeightRef.current + deltaY)
      );
      setMobileTimelineHeight(newHeight);
    },
    []
  );

  const handleTimelineDragEnd = useCallback(() => {
    timelineDragRef.current = false;
    // Snap to nearest preset
    setMobileTimelineHeight((prev) => {
      if (prev < 110) return MOBILE_TIMELINE_COMPACT;
      if (prev < 200) return MOBILE_TIMELINE_DEFAULT;
      if (prev < 320) return MOBILE_TIMELINE_EXPANDED;
      return MOBILE_TIMELINE_MAX;
    });
  }, []);

  // Toggle timeline between compact and expanded with one tap
  const toggleMobileTimeline = useCallback(() => {
    setMobileTimelineHeight((prev) =>
      prev <= MOBILE_TIMELINE_DEFAULT ? MOBILE_TIMELINE_EXPANDED : MOBILE_TIMELINE_DEFAULT
    );
  }, []);

  // Resize handle for timeline (desktop)
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

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--background)]">
      {/* Top bar */}
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
          <span className="hidden sm:inline">{captions.length} legendas</span>
          <span className="hidden sm:inline w-px h-4 bg-[var(--border)]" />
          <span className="hidden sm:inline">{effects.length} efeitos</span>
        </div>
      </header>

      {/* ====== DESKTOP LAYOUT ====== */}
      <div className="hidden md:flex flex-1 overflow-hidden flex-col">
        <div className="flex-1 flex overflow-hidden">
          {/* Video preview - left side */}
          <div className="flex-1 min-w-0">
            <VideoPreview />
          </div>

          {/* Right sidebar */}
          <div className="w-80 bg-[var(--surface)] border-l border-[var(--border)] flex flex-col shrink-0">
            {/* Tab bar */}
            <div className="flex border-b border-[var(--border)] shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2.5 flex flex-col items-center gap-1 text-[10px] transition-colors ${
                    activeTab === tab.key
                      ? "text-[var(--accent-light)] border-b-2 border-[var(--accent)] bg-[var(--accent)]/5"
                      : "text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "captions" && <CaptionEditor />}
              {activeTab === "effects" && <EffectsEditor />}
              {activeTab === "broll" && <BRollPanel />}
              {activeTab === "export" && <ExportPanel />}
            </div>
          </div>
        </div>

        {/* Timeline resize handle */}
        <div
          className="h-1.5 bg-[var(--surface)] border-t border-[var(--border)] cursor-row-resize hover:bg-[var(--accent)]/20 active:bg-[var(--accent)]/30 transition-colors flex items-center justify-center shrink-0 group"
          onMouseDown={handleResizeStart}
        >
          <div className="w-8 h-0.5 rounded-full bg-[var(--text-secondary)]/30 group-hover:bg-[var(--accent)]/60 transition-colors" />
        </div>

        {/* Timeline - bottom, resizable */}
        <div className="shrink-0" style={{ height: timelineHeight }}>
          <Timeline />
        </div>
      </div>

      {/* ====== MOBILE LAYOUT ====== */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {/* Main content area: video + sliding panel */}
        <div ref={mobileContentRef} className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
          {/* Video preview - always visible, shrinks as panel grows */}
          <div
            className="min-h-[80px] transition-all duration-300 ease-out"
            style={{ flex: `1 1 ${100 - mobilePanelPercent}%` }}
          >
            <VideoPreview />
          </div>

          {/* Panel area - grows from bottom */}
          {mobilePanelOpen && (
            <div
              className="bg-[var(--surface)] border-t border-[var(--border)] flex flex-col overflow-hidden transition-all duration-300 ease-out"
              style={{ flex: `0 0 ${mobilePanelPercent}%` }}
            >
              {/* Drag handle */}
              <div
                className="flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing touch-none shrink-0"
                onTouchStart={handleMobilePanelDragStart}
                onTouchMove={handleMobilePanelDragMove}
                onTouchEnd={handleMobilePanelDragEnd}
              >
                <GripHorizontal className="w-5 h-5 text-[var(--text-secondary)]/50" />
              </div>

              {/* Panel content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === "captions" && <CaptionEditor />}
                {activeTab === "effects" && <EffectsEditor />}
                {activeTab === "broll" && <BRollPanel />}
                {activeTab === "export" && <ExportPanel />}
              </div>
            </div>
          )}
        </div>

        {/* Tab bar - always visible */}
        <div className="shrink-0 bg-[var(--surface)] border-t border-[var(--border)]">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  if (activeTab === tab.key && mobilePanelOpen) {
                    // Tapping same active tab toggles panel
                    setMobilePanelPercent(MOBILE_PANEL_COLLAPSED);
                  } else {
                    setActiveTab(tab.key);
                    // Open or expand panel when selecting a tab
                    setMobilePanelPercent((prev) =>
                      prev < MOBILE_PANEL_HALF ? MOBILE_PANEL_HALF : prev
                    );
                  }
                }}
                className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
                  activeTab === tab.key && mobilePanelOpen
                    ? "text-[var(--accent-light)] bg-[var(--accent)]/5 border-t-2 border-[var(--accent)]"
                    : "text-[var(--text-secondary)] active:text-[var(--foreground)] border-t-2 border-transparent"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline resize handle (mobile) */}
        <div className="shrink-0 bg-[var(--surface)] border-t border-[var(--border)]">
          <div
            className="flex items-center justify-center gap-2 py-1 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={handleTimelineDragStart}
            onTouchMove={handleTimelineDragMove}
            onTouchEnd={handleTimelineDragEnd}
          >
            <button
              onClick={toggleMobileTimeline}
              className="p-0.5 rounded-md hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)] transition-colors"
            >
              {mobileTimelineHeight <= MOBILE_TIMELINE_DEFAULT ? (
                <ChevronUp className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              )}
            </button>
            <div className="w-8 h-0.5 rounded-full bg-[var(--text-secondary)]/40" />
            <span className="text-[9px] text-[var(--text-secondary)]/60 uppercase tracking-wider">
              Timeline
            </span>
            <div className="w-8 h-0.5 rounded-full bg-[var(--text-secondary)]/40" />
          </div>
        </div>

        {/* Timeline - mobile, resizable */}
        <div
          className="shrink-0 transition-[height] duration-200 ease-out"
          style={{ height: mobileTimelineHeight }}
        >
          <Timeline />
        </div>
      </div>
    </div>
  );
}
