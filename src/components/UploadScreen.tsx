"use client";

import { useCallback, useState } from "react";
import { Upload, Film, Sparkles, Zap, Type, Wand2, MonitorPlay, Cpu, Brain, BarChart3 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { motion } from "framer-motion";
import type { ContentPillar } from "@/types";

export default function UploadScreen() {
  const { setVideoFile, setVideoUrl, setVideoDuration, setStatus, setBrandingConfig } =
    useProjectStore();
  const [dragOver, setDragOver] = useState(false);
  const [selectedPillar, setSelectedPillar] = useState<ContentPillar | null>(null);

  const contentPillars: { key: ContentPillar; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    { key: "ia-tech", label: "IA & Tecnologia", desc: "Ferramentas, automação, futuro", icon: <Cpu className="w-4 h-4" />, color: "#00D4AA" },
    { key: "psych-neuro", label: "Psicologia & Neuro", desc: "Cérebro, comportamento, mente", icon: <Brain className="w-4 h-4" />, color: "#E8A838" },
    { key: "intersection", label: "IA + Comportamento", desc: "Tecnologia encontra psicologia", icon: <Sparkles className="w-4 h-4" />, color: "#00D4AA" },
    { key: "cases", label: "Cases & Resultados", desc: "Transformações de clientes", icon: <BarChart3 className="w-4 h-4" />, color: "#FFD700" },
    { key: "quick-tips", label: "Dicas Rápidas", desc: "Insights curtos e acionáveis", icon: <Zap className="w-4 h-4" />, color: "#a78bfa" },
  ];

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("video/")) {
        alert("Por favor, selecione um arquivo de vídeo.");
        return;
      }
      const url = URL.createObjectURL(file);

      // Extract video duration BEFORE starting the processing pipeline
      // This is critical: ProcessingScreen needs videoDuration to build captions/effects
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        setVideoDuration(video.duration);
        if (selectedPillar) setBrandingConfig({ contentPillar: selectedPillar });
        setVideoFile(file);
        setVideoUrl(url);
        setStatus("uploading");
      };
      video.onerror = () => {
        // Even if metadata fails, still proceed (ProcessingScreen has fallbacks)
        if (selectedPillar) setBrandingConfig({ contentPillar: selectedPillar });
        setVideoFile(file);
        setVideoUrl(url);
        setStatus("uploading");
      };
      video.src = url;
    },
    [setVideoFile, setVideoUrl, setVideoDuration, setStatus]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const features = [
    {
      icon: <Type className="w-5 h-5" />,
      title: "Legendas com IA",
      desc: "Transcrição automática com animações",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Edição Cinematográfica",
      desc: "Zooms, cortes e efeitos automáticos",
    },
    {
      icon: <Film className="w-5 h-5" />,
      title: "B-Roll com IA",
      desc: "Imagens geradas por Imagen 3",
    },
    {
      icon: <Wand2 className="w-5 h-5" />,
      title: "Tudo Editável",
      desc: "Ajuste cada efeito e legenda",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 md:p-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-6 md:mb-12"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-500 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--accent-light)] to-purple-400 bg-clip-text text-transparent">
            CineAI
          </h1>
        </div>
        <p className="text-[var(--text-secondary)] text-lg max-w-md mx-auto">
          Transforme seus vídeos em conteúdo cinematográfico para redes sociais
          com inteligência artificial
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className={`relative w-full max-w-xl border-2 border-dashed rounded-2xl p-8 md:p-16 text-center cursor-pointer transition-all duration-300 ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.02]"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)]"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("video-input")?.click()}
      >
        <input
          id="video-input"
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleInput}
        />
        <div
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-colors ${
            dragOver ? "bg-[var(--accent)]/20" : "bg-[var(--surface-hover)]"
          }`}
        >
          <Upload
            className={`w-8 h-8 transition-colors ${
              dragOver ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
            }`}
          />
        </div>
        <p className="text-lg font-medium mb-2">
          {dragOver ? "Solte o vídeo aqui" : "Arraste seu vídeo ou clique para selecionar"}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          MP4, MOV, WebM — Máx. 500MB
        </p>
      </motion.div>

      {/* Teleprompter option */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-6"
      >
        <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span>ou</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <button
          onClick={() => setStatus("teleprompter")}
          className="mt-4 flex items-center gap-3 px-6 py-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)] transition-all mx-auto group"
        >
          <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center group-hover:bg-[var(--accent)]/20 transition-colors">
            <MonitorPlay className="w-5 h-5 text-[var(--accent-light)]" />
          </div>
          <div className="text-left">
            <p className="font-medium text-sm">Gravar com Teleprompter</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Grave lendo seu roteiro e edite automaticamente
            </p>
          </div>
        </button>
      </motion.div>

      {/* Content Pillar Selector */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-6 max-w-3xl w-full"
      >
        <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-2 text-center">
          Pilar de Conteúdo (opcional)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {contentPillars.map((p) => (
            <button
              key={p.key}
              onClick={() => setSelectedPillar(selectedPillar === p.key ? null : p.key)}
              className={`py-2.5 px-3 rounded-xl border text-left transition-all duration-200 ${
                selectedPillar === p.key
                  ? "border-transparent bg-[var(--surface-hover)] scale-[1.02]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border)]/80 hover:bg-[var(--surface-hover)]"
              }`}
              style={selectedPillar === p.key ? { borderColor: p.color, boxShadow: `0 0 12px ${p.color}25` } : {}}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: `${p.color}20`, color: p.color }}
                >
                  {p.icon}
                </div>
                <span className="text-xs font-semibold truncate">{p.label}</span>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] leading-tight">{p.desc}</p>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-8 md:mt-12 max-w-3xl w-full pb-4"
      >
        {features.map((f, i) => (
          <div
            key={i}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center hover:border-[var(--accent)]/30 transition-colors"
          >
            <div className="w-10 h-10 mx-auto rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent-light)] mb-3">
              {f.icon}
            </div>
            <p className="font-medium text-sm mb-1">{f.title}</p>
            <p className="text-xs text-[var(--text-secondary)]">{f.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
