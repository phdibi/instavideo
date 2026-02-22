export interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  style: CaptionStyle;
  animation: CaptionAnimation;
  emphasis: string[];
  emoji?: string; // Emoji displayed above the caption (e.g., 🧠 above "CÉREBRO")
  topicLabel?: string; // Topic label shown above caption (e.g., "LEARNING STRATEGY")
  keywordLabel?: string; // Large keyword displayed ABOVE the caption (Ember-style dual-layer)
  keywordQuotes?: boolean; // Whether to wrap the keywordLabel in decorative quotes ("KEYWORD")
  wordTimings?: { start: number; end: number }[]; // Per-word timestamps for precise karaoke sync
}

// ===== Caption Visual Theme =====
// Determines the color palette used for emphasis, highlights, and decorative elements.
// "volt" = neon yellow-green (#CCFF00), energetic/tech
// "ember" = warm salmon/terracotta (#D4835C), editorial/cinematic
export type CaptionTheme = "volt" | "ember" | "velocity" | "authority";

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: "top" | "center" | "bottom";
  textAlign: "left" | "center" | "right";
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  letterSpacing?: string;
}

export type CaptionAnimation =
  | "none"
  | "fade"
  | "typewriter"
  | "bounce"
  | "slide-up"
  | "pop"
  | "highlight-word"
  | "karaoke"
  | "glow"
  | "shake"
  | "wave"
  | "zoom-in"
  | "flip"
  | "color-cycle";

export interface EditEffect {
  id: string;
  type: EffectType;
  startTime: number;
  endTime: number;
  params: Record<string, unknown>;
}

export type EffectType =
  | "zoom-in"
  | "zoom-out"
  | "zoom-pulse"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "shake"
  | "transition-fade"
  | "transition-swipe"
  | "transition-zoom"
  | "transition-glitch"
  | "b-roll"
  | "color-grade"
  | "vignette"
  | "letterbox"
  | "slow-motion"
  | "speed-ramp"
  | "flash"
  | "blur-background";

export interface BRollImage {
  id: string;
  url: string;
  prompt: string;
  startTime: number;
  endTime: number;
  animation: "fade" | "slide" | "zoom" | "ken-burns" | "pan-left" | "pan-up" | "pan-down" | "blur-in";
  opacity: number;
  position: "fullscreen" | "overlay" | "split" | "pip";
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  volume: number;
  intensity: number;
  mood: string;
  text: string;
}

export interface EditPlan {
  captions: Caption[];
  effects: EditEffect[];
  bRollSuggestions: BRollSuggestion[];
  audioAnalysis: AudioSegment[];
  overallMood: string;
  pacing: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
}

export interface BRollSuggestion {
  id: string;
  timestamp: number;
  duration: number;
  prompt: string;
  reason: string;
}

export interface ProjectState {
  id: string;
  videoFile: File | null;
  videoUrl: string;
  videoDuration: number;
  status: ProjectStatus;
  captions: Caption[];
  effects: EditEffect[];
  bRollImages: BRollImage[];
  editPlan: EditPlan | null;
  currentTime: number;
  isPlaying: boolean;
  audioExtracted: boolean;
}

export type ProjectStatus =
  | "idle"
  | "teleprompter"
  | "uploading"
  | "extracting-audio"
  | "transcribing"
  | "analyzing"
  | "generating-plan"
  | "generating-broll"
  | "ready"
  | "exporting"
  | "error";

// ===== AI Preset System =====
export type PresetType = "hook" | "talking-head" | "talking-head-broll" | "futuristic-hud";

export interface VideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  preset: PresetType;
  keywordHighlight: string; // most important word/phrase to highlight
  brollQuery: string; // query for B-Roll search/generation
  confidence: number; // 0-1 how confident the detection is
}

export interface TeleprompterSettings {
  script: string;
  fontSize: number;
  scrollSpeed: number;
  mirrorText: boolean;
  showTimer: boolean;
  countdownSeconds: number;
  textColor: string;
  backgroundColor: string;
  opacity: number;
  lineHeight: number;
  paddingHorizontal: number;
  cueLinePosition: number; // 0-100 percentage from top
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  language: string;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
  words?: TranscriptionWord[];
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

// ===== Content Pillar System =====
export type ContentPillar =
  | "ia-tech"           // IA & Tecnologia
  | "psych-neuro"       // Psicologia & Neurociências
  | "intersection"      // IA + Comportamento Humano
  | "cases"             // Cases & Resultados
  | "quick-tips";       // Dicas Rápidas

// ===== CTA System =====
export type CTATemplate =
  | "siga"              // "Siga para mais conteúdo"
  | "salve"             // "Salve para consultar depois"
  | "comente"           // "Comente [X]"
  | "compartilhe";      // "Compartilhe com alguém que precisa"

// ===== Personal Branding =====
export interface BrandingConfig {
  name: string;
  title: string;
  showWatermark: boolean;
  showCTA: boolean;
  ctaTemplate: CTATemplate;
  ctaCustomText?: string;
  contentPillar: ContentPillar;
}
