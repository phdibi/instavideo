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
  offsetX?: number; // Horizontal offset in % (-50 to 50), 0 = center
  offsetY?: number; // Vertical offset in % (-50 to 50), 0 = default position
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

export type BRollAnimation =
  | "fade"
  | "slide"
  | "zoom"
  | "ken-burns"
  | "pan-left"
  | "pan-up"
  | "pan-down"
  | "blur-in"
  | "cinematic-reveal"  // Zoom out from detail → full frame with blur transition
  | "glitch-in"         // Quick digital glitch effect on entry
  | "parallax";         // Multi-layer parallax depth movement

export type BRollPosition = "fullscreen" | "overlay" | "split" | "split-left" | "top-half" | "bottom-half" | "center-inset" | "pip";

export interface BRollImage {
  id: string;
  url: string;
  prompt: string;
  startTime: number;
  endTime: number;
  animation: BRollAnimation;
  opacity: number;
  position: BRollPosition;
  cinematicOverlay?: boolean;  // Auto gradient overlay for professional look (default: true)
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

export type ProjectStatus =
  | "idle"
  | "teleprompter"
  | "uploading"
  | "extracting-audio"
  | "transcribing"
  | "analyzing"
  | "analyzing-modes"
  | "fetching-broll"
  | "building-video"
  | "generating-plan"
  | "generating-broll"
  | "ready"
  | "exporting"
  | "error";

// ===== B-Roll Layout System =====
export type BRollLayout = "fullscreen" | "split" | "overlay" | "pip" | "cinematic" | "diagonal";

// ===== B-Roll Effect System =====
export type BRollEffect =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "ken-burns"
  | "parallax"
  | "static";

// ===== Caption Config (user-customizable) =====
export interface CaptionConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  position: "top" | "center" | "bottom";
  animation: "none" | "fade" | "pop" | "slide-up" | "typewriter";
  uppercase: boolean;
  letterSpacing: number;
  backgroundEnabled?: boolean;
  backgroundColor?: string;     // default "#000000"
  backgroundOpacity?: number;   // default 0.6
  backgroundPadding?: number;   // default 8
  backgroundBorderRadius?: number; // default 4
}

// ===== Stanza Config (stylized stacked captions) =====
export interface StanzaConfig {
  enabled: boolean;           // default: true
  intervalSeconds: number;    // default: 4
  wordsPerStanza: number;     // default: 3
  emphasisFontSize: number;   // default: 56
  normalFontSize: number;     // default: 28
  emphasisFontFamily: string; // default: "Playfair Display"
  normalFontFamily: string;   // default: "Inter"
  stanzaLayout: "centered" | "cascading" | "inline" | "diagonal" | "scattered"; // default: "centered"
}

// ===== New Mode System (vibefounder style) =====
export type TransitionType = "cut" | "crossfade" | "fade-black";
export type VideoMode = "presenter" | "broll" | "typography";

export interface ModeSegment {
  id: string;
  mode: VideoMode;
  startTime: number;
  endTime: number;
  brollVideoUrl?: string;
  brollQuery?: string;
  brollPromptAI?: string;  // Detailed prompt for AI image generation (richer than brollQuery)
  pexelsAlternatives?: PexelsVideoResult[];
  typographyText?: string;
  typographyBackground?: "#F5F0E8" | "#0a0a0a";
  typographyAnimation?: "pop-in" | "fade-up" | "typewriter" | "slide-in";
  typographyStagger?: number;
  transcriptText?: string;
  brollImageUrl?: string;
  brollMediaType?: "video" | "photo";
  pexelsPhotoAlternatives?: PexelsPhotoResult[];
  brollEffect?: BRollEffect;
  brollEffectIntensity?: number;
  brollLayout?: BRollLayout;
  presenterZoom?: "none" | "zoom-in" | "zoom-out" | "parallax";
  presenterZoomIntensity?: number; // 0.5-2.0, default 1.0
  presenterZoomEasing?: "smooth" | "abrupt";
  presenterZoomStart?: number; // 0-1, when zoom starts (% of segment)
  presenterZoomEnd?: number;   // 0-1, when zoom ends (% of segment)
  transition?: TransitionType;      // default 'cut'
  transitionDuration?: number;      // default 0.5s
}

export interface PexelsVideoResult {
  id: number;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  duration: number;
}

export interface PexelsPhotoResult {
  id: number;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
}

export interface PhraseCaption {
  id: string;
  startTime: number;
  endTime: number;
  text: string; // 1-2 words
  isEmphasis?: boolean;  // word gets large/bold/italic serif treatment
  stanzaId?: string;     // groups words that stack together on screen
  styleOverride?: Partial<CaptionConfig>; // per-caption style override
}

export interface MusicTrack {
  id: string;
  name: string;
  file: string;
  duration: number;
  isCustom?: boolean; // blob URL, not persisted
}

export interface MusicConfig {
  trackId: string | null;
  baseVolume: number;   // 0.30
  duckVolume: number;   // 0.15
  fadeInDuration: number;
  fadeOutDuration: number;
}

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

// ===== SFX Sound Types =====
export type SFXSoundType = "whoosh" | "whoosh-out" | "impact" | "rise" | "slide" | "pop" | "swoosh" | "ding" | "thud" | "shimmer" | "snap" | "reverse-hit";

export interface SFXMarker {
  id: string;
  time: number;
  soundType: SFXSoundType;
  volume?: number; // 0-1, per-marker volume multiplier (default 1.0)
}

// ===== SFX System =====
export type SFXProfile = "corporate" | "minimal" | "cinematic" | "none";

export interface SFXConfig {
  profile: SFXProfile;
  masterVolume: number; // 0-1
  hookImpact: boolean;
  hookRise: boolean;
  brollEnter: boolean;
  brollExit: boolean;
  segmentChange: boolean;
}

// ===== CTA System =====
export type CTATemplate =
  | "siga"              // "Siga para mais conteúdo"
  | "salve"             // "Salve para consultar depois"
  | "comente"           // "Comente [X]"
  | "compartilhe";      // "Compartilhe com alguém que precisa"

// ===== Personal Branding =====
// ===== Voice Enhancer =====
export type VoiceEnhancePreset = "off" | "natural" | "podcast" | "cinematic";

export interface VoiceEnhanceConfig {
  preset: VoiceEnhancePreset;
  intensity: number; // 0-1
}

export interface BrandingConfig {
  name: string;
  title: string;
  showWatermark: boolean;
  showCTA: boolean;
  ctaTemplate: CTATemplate;
  ctaCustomText?: string;
  contentPillar: ContentPillar;
}

