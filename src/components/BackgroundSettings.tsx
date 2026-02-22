"use client";

import { useRef, useState } from "react";
import { Monitor, Mic, Upload, X, Sliders } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * BackgroundSettings — UI for configuring background replacement + virtual microphone.
 * Rendered in the Upload Screen before video processing.
 */
export default function BackgroundSettings() {
  const { backgroundConfig, setBackgroundConfig } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    backgroundConfig.backgroundImageUrl || null
  );

  const handleToggle = () => {
    setBackgroundConfig({ enabled: !backgroundConfig.enabled });
  };

  const handleMicToggle = () => {
    setBackgroundConfig({ microphoneOverlay: !backgroundConfig.microphoneOverlay });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a data URL for preview and storage
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setBackgroundConfig({ backgroundImageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setPreviewUrl(null);
    setBackgroundConfig({ backgroundImageUrl: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSmoothingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackgroundConfig({ edgeSmoothing: parseFloat(e.target.value) });
  };

  return (
    <div className="w-full">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          Cenário de Fundo
        </span>
        <button
          onClick={handleToggle}
          className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
            backgroundConfig.enabled
              ? "bg-[var(--accent)]"
              : "bg-[var(--border)]"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
              backgroundConfig.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {backgroundConfig.enabled && (
        <div className="space-y-3 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
          {/* Background Image Upload */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">
              Imagem de Fundo
            </label>
            {previewUrl ? (
              <div className="relative group">
                <div
                  className="w-full h-24 rounded-lg bg-cover bg-center border border-[var(--border)]"
                  style={{ backgroundImage: `url(${previewUrl})` }}
                />
                <button
                  onClick={handleRemoveImage}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-20 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] transition-colors flex flex-col items-center justify-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)]"
              >
                <Upload className="w-4 h-4" />
                <span className="text-xs">Upload ou arraste imagem</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Microphone Toggle */}
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                Microfone Podcast
              </span>
            </div>
            <button
              onClick={handleMicToggle}
              className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${
                backgroundConfig.microphoneOverlay
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${
                  backgroundConfig.microphoneOverlay
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Edge Smoothing Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span className="text-xs text-[var(--text-secondary)]">
                  Suavização de Bordas
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                {Math.round(backgroundConfig.edgeSmoothing * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={backgroundConfig.edgeSmoothing}
              onChange={handleSmoothingChange}
              className="w-full h-1 rounded-full appearance-none bg-[var(--border)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]"
            />
          </div>

          {/* Info tip */}
          <div className="flex items-start gap-2 pt-1">
            <Monitor className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
              A IA detecta sua silhueta e substitui o fundo automaticamente.
              Funciona melhor com boa iluminação e fundo uniforme.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
