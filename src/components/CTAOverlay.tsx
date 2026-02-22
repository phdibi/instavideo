"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";
import { isAuthorityTheme, getAuthorityLean, isVelocityTheme, isEmberTheme } from "@/lib/presets";
import type { CTATemplate } from "@/types";

interface Props {
  currentTime: number;
  videoDuration: number;
}

const CTA_TEXTS: Record<CTATemplate, string> = {
  siga: "Siga para mais conteúdo",
  salve: "Salve para consultar depois",
  comente: "Comente",
  compartilhe: "Compartilhe com alguém que precisa",
};

function getAccentColor(): string {
  if (isAuthorityTheme()) {
    const lean = getAuthorityLean();
    return lean === "amber" ? "#E8A838" : "#00D4AA";
  }
  if (isVelocityTheme()) return "#FFD700";
  if (isEmberTheme()) return "#D4835C";
  return "#CCFF00";
}

export default function CTAOverlay({ currentTime, videoDuration }: Props) {
  const { brandingConfig } = useProjectStore();

  if (!brandingConfig.showCTA || videoDuration < 5) return null;

  const ctaStart = videoDuration - 3;
  if (currentTime < ctaStart || currentTime > videoDuration) return null;

  const progress = (currentTime - ctaStart) / 3;
  const accentColor = getAccentColor();

  let text = CTA_TEXTS[brandingConfig.ctaTemplate];
  if (brandingConfig.ctaTemplate === "comente") {
    text = `Comente "${brandingConfig.ctaCustomText || "EU QUERO"}"`;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {progress >= 0 && (
          <motion.div
            className="absolute top-[6%] right-[4%] flex flex-col items-end"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div
              className="px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(8px)",
              }}
            >
              <p
                className="text-white font-bold text-right"
                style={{
                  fontSize: "clamp(11px, 2.5vw, 16px)",
                  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                  letterSpacing: "0.02em",
                  lineHeight: 1.3,
                }}
              >
                {text}
              </p>
              <motion.div
                className="mt-1 rounded-full ml-auto"
                style={{
                  backgroundColor: accentColor,
                  height: "2px",
                }}
                initial={{ width: 0 }}
                animate={{ width: "60px" }}
                transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Export for canvas rendering in ExportPanel
export function getCTAText(ctaTemplate: CTATemplate, ctaCustomText?: string): string {
  if (ctaTemplate === "comente") {
    return `Comente "${ctaCustomText || "EU QUERO"}"`;
  }
  return CTA_TEXTS[ctaTemplate];
}

export { getAccentColor };
