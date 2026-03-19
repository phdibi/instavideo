import type { TransitionType } from "@/types";

/**
 * Compute transition alpha for the incoming segment.
 *
 * Since both preview (DOM) and export (canvas) render only the current segment,
 * true dual-source crossfade is not possible. Instead:
 * - "crossfade" → smooth opacity fade-in of the incoming segment
 * - "fade-black" → fade through black (fade out to black, then fade in from black)
 * - "cut" → instant switch (no transition)
 *
 * @param type - The transition type
 * @param progress - 0 to 1 (0 = start of transition, 1 = end)
 * @returns inAlpha (opacity of incoming segment), blackAlpha (opacity of black overlay)
 */
export function getTransitionAlpha(
  type: TransitionType,
  progress: number
): { inAlpha: number; blackAlpha: number } {
  const p = Math.max(0, Math.min(1, progress));

  switch (type) {
    case "crossfade":
      // Smooth fade-in of the incoming segment
      return { inAlpha: p, blackAlpha: 0 };

    case "fade-black":
      // First half: black overlay increases; second half: incoming fades in
      if (p < 0.5) {
        return { inAlpha: 0, blackAlpha: p * 2 };
      }
      return { inAlpha: (p - 0.5) * 2, blackAlpha: 1 - (p - 0.5) * 2 };

    case "cut":
    default:
      return { inAlpha: 1, blackAlpha: 0 };
  }
}
