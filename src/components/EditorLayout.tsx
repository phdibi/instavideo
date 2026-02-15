"use client";

import { useState, useEffect } from "react";
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

export default function EditorLayout() {
  const [activeTab, setActiveTab] = useState<Tab>("captions");
  const { reset, captions, effects, selectedItem } = useProjectStore();

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

      {/* Timeline - bottom */}
      <div className="h-[160px] shrink-0">
        <Timeline />
      </div>
    </div>
  );
}
