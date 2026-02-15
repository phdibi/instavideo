"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Type,
  Sparkles,
  Image as ImageIcon,
  Download,
  ArrowLeft,
  Film,
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

export default function EditorLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("captions");
  const { reset, captions, effects, selectedItem } = useProjectStore();
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Auto-switch sidebar tab when an item is selected from the timeline
  useEffect(() => {
    if (!selectedItem) return;
    const tabMap: Record<string, Tab> = {
      caption: "captions",
      effect: "effects",
      broll: "broll",
    };
    const targetTab = tabMap[selectedItem.type];
    if (targetTab) setActiveTab(targetTab);
  }, [selectedItem]);

  // Resize handle for timeline
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = timelineHeight;

    const handleMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startYRef.current - ev.clientY; // dragging up = bigger
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
  }, [timelineHeight]);

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
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
          <span>{captions.length} legendas</span>
          <span className="w-px h-4 bg-[var(--border)]" />
          <span>{effects.length} efeitos</span>
        </div>
      </header>

      {/* Main content */}
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
  );
}
