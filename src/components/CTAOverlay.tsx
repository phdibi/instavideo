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
            className="absolute bottom-[20%] left-0 right-0 flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <p
              className="text-white font-bold text-center px-4"
              style={{
                fontSize: "clamp(14px, 3.5vw, 22px)",
                textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)",
                letterSpacing: "0.02em",
              }}
            >
              {text}
            </p>
            <motion.div
              className="mt-2 rounded-full"
              style={{
                backgroundColor: accentColor,
                height: "3px",
              }}
              initial={{ width: 0 }}
              animate={{ width: "120px" }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            />
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
