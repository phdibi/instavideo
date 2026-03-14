"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Type,
  Image as ImageIcon,
  PenLine,
  Music,
  Download,
  AudioLines,
} from "lucide-react";
import CaptionPanel from "./panels/CaptionPanel";
import BRollPanel from "./panels/BRollPanel";
import TypographyPanel from "./panels/TypographyPanel";
import SFXPanel from "./panels/SFXPanel";
import MusicPanel from "./MusicPanel";
import ExportPanel from "./ExportPanel";

export type ToolbarCategory = "captions" | "broll" | "typography" | "sfx" | "music" | "export";

const CATEGORIES: { key: ToolbarCategory; label: string; icon: React.ReactNode }[] = [
  { key: "captions", label: "Legendas", icon: <Type className="w-5 h-5" /> },
  { key: "broll", label: "B-Roll", icon: <ImageIcon className="w-5 h-5" /> },
  { key: "typography", label: "Tipografia", icon: <PenLine className="w-5 h-5" /> },
  { key: "sfx", label: "Sons", icon: <AudioLines className="w-5 h-5" /> },
  { key: "music", label: "Música", icon: <Music className="w-5 h-5" /> },
  { key: "export", label: "Exportar", icon: <Download className="w-5 h-5" /> },
];

interface Props {
  activeCategory: ToolbarCategory | null;
  onCategoryChange: (cat: ToolbarCategory | null) => void;
}

export default function EditingToolbar({ activeCategory, onCategoryChange }: Props) {
  const panelOpen = activeCategory !== null;

  const handleCategoryClick = useCallback(
    (key: ToolbarCategory) => {
      if (activeCategory === key) {
        onCategoryChange(null);
      } else {
        onCategoryChange(key);
      }
    },
    [activeCategory, onCategoryChange]
  );

  // Esc closes active panel
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panelOpen) {
        onCategoryChange(null);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [panelOpen, onCategoryChange]);

  const renderPanelContent = () => {
    switch (activeCategory) {
      case "captions":
        return <CaptionPanel />;
      case "broll":
        return <BRollPanel />;
      case "typography":
        return <TypographyPanel />;
      case "sfx":
        return <SFXPanel />;
      case "music":
        return <MusicPanel />;
      case "export":
        return <ExportPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col shrink-0">
      {/* Slide-up panel */}
      <AnimatePresence>
        {panelOpen && activeCategory && (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
            }}
            className="overflow-hidden bg-[var(--surface)] border-t border-[var(--border)]"
          >
            <div className="max-h-[50vh] md:max-h-[50vh] overflow-y-auto overscroll-contain pb-safe">
              {renderPanelContent()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Icon bar */}
      <div className="bg-[var(--surface)] border-t border-[var(--border)] pb-safe">
        <div className="flex">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryClick(cat.key)}
              className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
                activeCategory === cat.key
                  ? "text-[var(--accent-light)] bg-[var(--accent)]/5"
                  : "text-[var(--text-secondary)] hover:text-[var(--foreground)] active:text-[var(--foreground)]"
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
