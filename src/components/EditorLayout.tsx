"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Download,
  ArrowLeft,
  Film,
  GripHorizontal,
  ChevronUp,
  ChevronDown,
  Eye,
  Layers,
  Image as ImageIcon,
  Music,
} from "lucide-react";
import VideoPreview from "./VideoPreview";
import ExportPanel from "./ExportPanel";
import MusicPanel from "./MusicPanel";
import MusicController from "./MusicController";
import BRollSwapGrid from "./BRollSwapGrid";
import Timeline from "./Timeline";
import { useProjectStore } from "@/store/useProjectStore";

type Tab = "preview" | "timeline" | "broll" | "music" | "export";

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "preview", label: "Preview", icon: <Eye className="w-4 h-4" /> },
  { key: "timeline", label: "Timeline", icon: <Layers className="w-4 h-4" /> },
  { key: "broll", label: "B-Roll", icon: <ImageIcon className="w-4 h-4" /> },
  { key: "music", label: "Música", icon: <Music className="w-4 h-4" /> },
  { key: "export", label: "Exportar", icon: <Download className="w-4 h-4" /> },
];

const MIN_TIMELINE_HEIGHT = 100;
const MAX_TIMELINE_HEIGHT = 500;
const DEFAULT_TIMELINE_HEIGHT = 200;

const MOBILE_PANEL_COLLAPSED = 0;
const MOBILE_PANEL_HALF = 60;
const MOBILE_PANEL_FULL = 92;

const MOBILE_TIMELINE_COMPACT = 80;
const MOBILE_TIMELINE_DEFAULT = 140;
const MOBILE_TIMELINE_EXPANDED = 260;
const MOBILE_TIMELINE_MAX = 380;

export default function EditorLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("preview");
  const { reset, modeSegments, selectedItem } = useProjectStore();
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const [mobilePanelPercent, setMobilePanelPercent] = useState(MOBILE_PANEL_COLLAPSED);
  const mobileDragRef = useRef(false);
  const mobileDragStartYRef = useRef(0);
  const mobileDragStartPercentRef = useRef(0);
  const mobileContentRef = useRef<HTMLDivElement>(null);

  const [mobileTimelineHeight, setMobileTimelineHeight] = useState(MOBILE_TIMELINE_DEFAULT);
  const timelineDragRef = useRef(false);
  const timelineDragStartYRef = useRef(0);
  const timelineDragStartHeightRef = useRef(0);

  const mobilePanelOpen = mobilePanelPercent > 0;

  // Selected b-roll segment for swap grid
  const selectedBrollSegment = modeSegments.find(
    (s) => s.mode === "broll" && selectedItem?.type === "segment" && selectedItem.id === s.id
  );

  // Auto-switch to broll tab when selecting a broll segment
  useEffect(() => {
    if (selectedItem?.type === "segment") {
      const seg = modeSegments.find((s) => s.id === selectedItem.id);
      if (seg?.mode === "broll") {
        setActiveTab("broll");
        if (mobilePanelPercent === MOBILE_PANEL_COLLAPSED) {
          setMobilePanelPercent(MOBILE_PANEL_HALF);
        }
      }
    }
  }, [selectedItem, modeSegments]);

  // Mobile panel drag handlers
  const handleMobilePanelDragStart = useCallback(
    (e: React.TouchEvent) => {
      mobileDragRef.current = true;
      mobileDragStartYRef.current = e.touches[0].clientY;
      mobileDragStartPercentRef.current = mobilePanelPercent;
    },
    [mobilePanelPercent]
  );

  const handleMobilePanelDragMove = useCallback((e: React.TouchEvent) => {
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
  }, []);

  const handleMobilePanelDragEnd = useCallback(() => {
    mobileDragRef.current = false;
    setMobilePanelPercent((prev) => {
      if (prev < 20) return MOBILE_PANEL_COLLAPSED;
      if (prev < 72) return MOBILE_PANEL_HALF;
      return MOBILE_PANEL_FULL;
    });
  }, []);

  const handleTimelineDragStart = useCallback(
    (e: React.TouchEvent) => {
      timelineDragRef.current = true;
      timelineDragStartYRef.current = e.touches[0].clientY;
      timelineDragStartHeightRef.current = mobileTimelineHeight;
    },
    [mobileTimelineHeight]
  );

  const handleTimelineDragMove = useCallback((e: React.TouchEvent) => {
    if (!timelineDragRef.current) return;
    const deltaY = timelineDragStartYRef.current - e.touches[0].clientY;
    const newHeight = Math.min(
      MOBILE_TIMELINE_MAX,
      Math.max(MOBILE_TIMELINE_COMPACT, timelineDragStartHeightRef.current + deltaY)
    );
    setMobileTimelineHeight(newHeight);
  }, []);

  const handleTimelineDragEnd = useCallback(() => {
    timelineDragRef.current = false;
    setMobileTimelineHeight((prev) => {
      if (prev < 110) return MOBILE_TIMELINE_COMPACT;
      if (prev < 200) return MOBILE_TIMELINE_DEFAULT;
      if (prev < 320) return MOBILE_TIMELINE_EXPANDED;
      return MOBILE_TIMELINE_MAX;
    });
  }, []);

  const toggleMobileTimeline = useCallback(() => {
    setMobileTimelineHeight((prev) =>
      prev <= MOBILE_TIMELINE_DEFAULT ? MOBILE_TIMELINE_EXPANDED : MOBILE_TIMELINE_DEFAULT
    );
  }, []);

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

  const renderTabContent = () => {
    switch (activeTab) {
      case "broll":
        return selectedBrollSegment ? (
          <BRollSwapGrid segment={selectedBrollSegment} />
        ) : (
          <div className="p-4 text-sm text-zinc-500">
            Selecione um segmento B-Roll na timeline para trocar o vídeo.
          </div>
        );
      case "music":
        return <MusicPanel />;
      case "export":
        return <ExportPanel />;
      default:
        return null;
    }
  };

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
          <span className="hidden sm:inline">{modeSegments.length} segmentos</span>
        </div>
      </header>

      {/* Music controller (invisible, handles audio) */}
      <MusicController />

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
              {tabs.filter(t => t.key !== "preview" && t.key !== "timeline").map((tab) => (
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
            <div className="flex-1 overflow-hidden overflow-y-auto">
              {renderTabContent()}
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
        <div ref={mobileContentRef} className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
          <div
            className="min-h-[80px] transition-all duration-300 ease-out"
            style={{ flex: `1 1 ${100 - mobilePanelPercent}%` }}
          >
            <VideoPreview />
          </div>

          {mobilePanelOpen && (
            <div
              className="bg-[var(--surface)] border-t border-[var(--border)] flex flex-col overflow-hidden transition-all duration-300 ease-out"
              style={{ flex: `0 0 ${mobilePanelPercent}%` }}
            >
              <div
                className="flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing touch-none shrink-0"
                onTouchStart={handleMobilePanelDragStart}
                onTouchMove={handleMobilePanelDragMove}
                onTouchEnd={handleMobilePanelDragEnd}
              >
                <GripHorizontal className="w-5 h-5 text-[var(--text-secondary)]/50" />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {renderTabContent()}
              </div>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="shrink-0 bg-[var(--surface)] border-t border-[var(--border)]">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  if (activeTab === tab.key && mobilePanelOpen) {
                    setMobilePanelPercent(MOBILE_PANEL_COLLAPSED);
                  } else {
                    setActiveTab(tab.key);
                    if (tab.key !== "preview" && tab.key !== "timeline") {
                      setMobilePanelPercent((prev) =>
                        prev < MOBILE_PANEL_HALF ? MOBILE_PANEL_HALF : prev
                      );
                    }
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

        {/* Timeline - mobile */}
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
