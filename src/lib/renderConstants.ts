// ===== Shared Render Constants =====
// Single source of truth for layout values used by CaptionOverlay (CSS) and ExportPanel (canvas).

// Reference dimensions (preview)
export const REF_WIDTH = 720;
export const REF_HEIGHT = 1280;

// Layout: cascading
export const CASCADE_EMPH_SCALE = 1.4;
export const CASCADE_INDENT_STEP = 40; // px at REF_WIDTH
export const CASCADE_EMPH_NUDGE = -12; // px at REF_WIDTH
export const CASCADE_MAX_INDENT = 220; // px cap at REF_WIDTH

// Layout: scattered
export const SCATTERED_X_OFFSET = 0.05;
export const SCATTERED_Y_BASE = 0.91;
export const SCATTERED_Y_RANGE = 0.24;

// Layout: diagonal
export const DIAGONAL_BASE_X = 0.015;
export const DIAGONAL_BASE_BOTTOM_Y = 0.92;
export const DIAGONAL_STEP_X = 0.14;
export const DIAGONAL_STEP_Y = 0.035;

// Deterministic pseudo-random for scattered layout (shared between preview & export)
export function scatteredRand(seed: number): number {
  return ((Math.sin(seed * 9371) * 43758.5453) % 1 + 1) % 1;
}

// Resolution presets for export
export const RESOLUTION_PRESETS = {
  "1080x1920": { width: 1080, height: 1920, label: "1080×1920 (9:16)" },
  "720x1280": { width: 720, height: 1280, label: "720×1280 (9:16)" },
  "1920x1080": { width: 1920, height: 1080, label: "1920×1080 (16:9)" },
  "1080x1080": { width: 1080, height: 1080, label: "1080×1080 (1:1)" },
} as const;

export type ResolutionKey = keyof typeof RESOLUTION_PRESETS;
