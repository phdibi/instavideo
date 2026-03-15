import type { BRollEffect } from "@/types";

export interface BRollTransform {
  scale: number;
  translateX: number; // percentage
  translateY: number; // percentage
}

/**
 * Compute the CSS transform values for a b-roll effect at a given progress.
 * @param effect - The effect type
 * @param progress - 0 to 1, how far through the segment we are
 * @param intensity - multiplier (default 1.0, range 0.5-2.0)
 */
export function computeBRollEffect(
  effect: BRollEffect,
  progress: number,
  intensity: number = 1.0
): BRollTransform {
  const i = intensity;
  const p = Math.min(1, Math.max(0, progress));

  switch (effect) {
    case "zoom-in":
      return {
        scale: 1 + p * 0.35 * i,
        translateX: 0,
        translateY: 0,
      };

    case "zoom-out":
      return {
        scale: 1 + (1 - p) * 0.35 * i,
        translateX: 0,
        translateY: 0,
      };

    case "pan-left":
      return {
        scale: 1 + 0.2 * i,
        translateX: (0.5 - p) * 8 * i,
        translateY: 0,
      };

    case "pan-right":
      return {
        scale: 1 + 0.2 * i,
        translateX: (-0.5 + p) * 8 * i,
        translateY: 0,
      };

    case "pan-up":
      return {
        scale: 1 + 0.2 * i,
        translateX: 0,
        translateY: (0.5 - p) * 8 * i,
      };

    case "pan-down":
      return {
        scale: 1 + 0.2 * i,
        translateX: 0,
        translateY: (-0.5 + p) * 8 * i,
      };

    case "ken-burns":
      // Combination of zoom-in + slow pan
      return {
        scale: 1 + p * 0.25 * i,
        translateX: (0.5 - p) * 5 * i,
        translateY: (0.3 - p * 0.6) * 3 * i,
      };

    case "parallax":
      // Sinusoidal movement
      return {
        scale: 1 + 0.12 * i,
        translateX: Math.sin(p * Math.PI * 2) * 4 * i,
        translateY: Math.cos(p * Math.PI) * 2.5 * i,
      };

    case "static":
    default:
      return { scale: 1, translateX: 0, translateY: 0 };
  }
}

/** Cubic ease-in-out easing */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Compute the CSS transform values for a presenter zoom/parallax effect.
 * Uses cubic easing for more dynamic zoom and higher base intensity.
 */
export function computePresenterEffect(
  zoom: string,
  progress: number,
  intensity: number = 1.0,
  _segmentIndex: number = 0
): BRollTransform {
  const p = Math.min(1, Math.max(0, progress));
  const easedP = easeInOutCubic(p);
  const baseIntensity = intensity * 0.12;

  switch (zoom) {
    case "zoom-in":
      return {
        scale: 1 + easedP * baseIntensity,
        translateX: 0,
        translateY: 0,
      };

    case "zoom-out":
      return {
        scale: 1 + (1 - easedP) * baseIntensity,
        translateX: 0,
        translateY: 0,
      };

    case "parallax":
      return {
        scale: 1 + 0.08 * intensity,
        translateX: Math.sin(p * Math.PI * 2) * 3 * intensity,
        translateY: Math.cos(p * Math.PI) * 2 * intensity,
      };

    case "none":
    default:
      return { scale: 1, translateX: 0, translateY: 0 };
  }
}

/** Convert a BRollTransform to a CSS transform string */
export function effectToCSS(transform: BRollTransform): string {
  const { scale, translateX, translateY } = transform;
  return `scale(${scale}) translate(${translateX}%, ${translateY}%)`;
}
