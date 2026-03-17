"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface NavigableItem {
  id: string;
  /** Time used for seeking when selecting this item */
  time: number;
}

interface Props {
  items: NavigableItem[];
  currentId: string;
  label: string;
  /** Tailwind text color class, e.g. "text-blue-300" */
  colorClass: string;
  onSelect: (id: string, time: number) => void;
}

/**
 * Prev/Next navigation bar for segment-like items.
 * Renders nothing if there's only 1 item.
 */
export default function SegmentNavigator({ items, currentId, label, colorClass, onSelect }: Props) {
  const { idx, prev, next } = useMemo(() => {
    const idx = items.findIndex((i) => i.id === currentId);
    return {
      idx,
      prev: idx > 0 ? items[idx - 1] : null,
      next: idx < items.length - 1 ? items[idx + 1] : null,
    };
  }, [items, currentId]);

  if (items.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => { if (prev) onSelect(prev.id, prev.time); }}
        disabled={!prev}
        className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className={`flex-1 text-xs text-center font-medium ${colorClass}`}>
        {label} {idx + 1} / {items.length}
      </span>
      <button
        onClick={() => { if (next) onSelect(next.id, next.time); }}
        disabled={!next}
        className="p-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:pointer-events-none transition-all"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
