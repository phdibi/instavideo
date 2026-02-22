"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { isAuthorityTheme, getAuthorityLean, isVelocityTheme, isEmberTheme } from "@/lib/presets";

interface Props {
  currentTime: number;
  videoDuration: number;
}

function getAccentColor(): string {
  if (isAuthorityTheme()) {
    const lean = getAuthorityLean();
    return lean === "amber" ? "#E8A838" : "#00D4AA";
  }
  if (isVelocityTheme()) return "#FFD700";
  if (isEmberTheme()) return "#D4835C";
  return "#CCFF00";
}

export default function WatermarkOverlay({ currentTime, videoDuration }: Props) {
  const { brandingConfig } = useProjectStore();

  if (!brandingConfig.showWatermark || videoDuration < 6) return null;

  const showStart = 2;
  const showEnd = videoDuration - 3.5;
  if (currentTime < showStart || currentTime > showEnd) return null;

  // Fade in/out
  const fadeIn = Math.min((currentTime - showStart) / 0.5, 1);
  const fadeOut = Math.min((showEnd - currentTime) / 0.5, 1);
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  const accentColor = getAccentColor();

  return (
    <div
      className="absolute top-[6%] left-[4%] pointer-events-none"
      style={{ opacity }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-[3px] h-7 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <div>
          <p
            className="text-white font-bold leading-tight tracking-wide"
            style={{
              fontSize: "clamp(8px, 2vw, 13px)",
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            {brandingConfig.name.toUpperCase()}
          </p>
          <p
            className="text-white/60 font-medium leading-tight"
            style={{
              fontSize: "clamp(6px, 1.5vw, 10px)",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            {brandingConfig.title}
          </p>
        </div>
      </div>
    </div>
  );
}
