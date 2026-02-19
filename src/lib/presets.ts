import { v4 as uuid } from "uuid";
import type {
  VideoSegment,
  PresetType,
  Caption,
  CaptionStyle,
  EditEffect,
  BRollImage,
  TranscriptionSegment,
} from "@/types";

// ===== Keyword detection sets =====
const FUTURISTIC_KEYWORDS = new Set([
  "ia", "inteligência artificial", "inteligencia artificial",
  "ai", "artificial intelligence",
  "tecnologia", "technology", "tech",
  "neural", "rede neural", "neurônio",
  "futuro", "future", "futurista", "futuristic",
  "dados", "data", "dataset", "big data",
  "algoritmo", "algorithm",
  "código", "code", "programação", "programming",
  "sistema", "system",
  "machine learning", "aprendizado de máquina",
  "deep learning", "aprendizado profundo",
  "automação", "automation",
  "robô", "robot", "robótica", "robotics",
  "blockchain", "crypto", "criptomoeda",
  "nuvem", "cloud", "computação",
  "digital", "virtual", "metaverso",
  "gpt", "chatgpt", "llm", "modelo de linguagem",
  "api", "software", "hardware",
  "iot", "internet das coisas",
  "quantum", "quântico",
  "cyber", "cibernético",
  "hacker", "hacking",
  "startup", "saas",
  "processamento", "servidor", "server",
  "python", "javascript", "react", "node",
]);

const VISUAL_CONTENT_KEYWORDS = new Set([
  "mostrar", "show", "ver", "see", "olhar", "look",
  "produto", "product", "tela", "screen",
  "gráfico", "graph", "chart",
  "imagem", "image", "foto", "photo",
  "vídeo", "video", "resultado", "result",
  "exemplo", "example", "demonstração", "demo",
  "lugar", "place", "cidade", "city", "país", "country",
  "natureza", "nature", "paisagem", "landscape",
  "comida", "food", "receita", "recipe",
  "carro", "car", "casa", "house",
  "dinheiro", "money", "investimento", "investment",
  "livro", "book", "treino", "workout",
  "implementar", "implement", "construir", "build",
  "criar", "create", "fazer", "make",
  "projetar", "design", "desenvolver", "develop",
]);

// ===== Detect preset for a segment =====
export function detectPreset(
  segment: { startTime: number; endTime: number; text: string },
  videoDuration: number,
  isFirst: boolean,
  hasBrollAvailable: boolean
): PresetType {
  // Rule 1: First segment within 5s = HOOK
  if (isFirst && segment.startTime < 5) {
    return "hook";
  }

  const textLower = segment.text.toLowerCase();
  const words = textLower.split(/\s+/);

  // Rule 2: Check for futuristic/tech keywords
  let futuristicScore = 0;
  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "");
    if (FUTURISTIC_KEYWORDS.has(cleaned)) {
      futuristicScore++;
    }
  }
  // Also check 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words[i].replace(/[.,!?;:'"()]/g, "") + " " + words[i + 1].replace(/[.,!?;:'"()]/g, "");
    if (FUTURISTIC_KEYWORDS.has(phrase)) {
      futuristicScore += 2;
    }
  }

  if (futuristicScore >= 2) {
    return "futuristic-hud";
  }

  // Rule 3: Check for visual content that warrants B-Roll
  let visualScore = 0;
  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "");
    if (VISUAL_CONTENT_KEYWORDS.has(cleaned)) {
      visualScore++;
    }
  }

  if (visualScore >= 1 || hasBrollAvailable) {
    return "talking-head-broll";
  }

  // Rule 4: Default = talking head
  return "talking-head";
}

// ===== Extract the most important keyword from text =====
export function extractKeywordHighlight(text: string): string {
  const words = text.split(/\s+/);
  if (words.length === 0) return "";
  if (words.length <= 2) return words[0];

  // Score each word
  const stopWords = new Set([
    "a", "o", "e", "é", "de", "do", "da", "que", "em", "um", "uma",
    "para", "com", "não", "no", "na", "os", "as", "se", "por", "mais",
    "como", "mas", "foi", "ao", "dos", "das", "ele", "ela", "isso",
    "the", "a", "an", "is", "are", "was", "and", "or", "to", "of",
    "in", "on", "at", "for", "it", "this", "that", "with", "from",
    "eu", "você", "nós", "eles", "isso", "aqui", "ali", "ser", "ter",
    "muito", "bem", "só", "já", "então", "vai", "vou", "pode",
    "quando", "onde", "qual", "quem", "seu", "sua", "meu", "minha",
  ]);

  let bestWord = words[0];
  let bestScore = -1;

  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "").toLowerCase();
    if (stopWords.has(cleaned) || cleaned.length <= 2) continue;

    let score = cleaned.length; // longer words tend to be more important

    // Bonus for tech/futuristic keywords
    if (FUTURISTIC_KEYWORDS.has(cleaned)) score += 10;
    if (VISUAL_CONTENT_KEYWORDS.has(cleaned)) score += 5;

    // Bonus for capitalized words (proper nouns, emphasis)
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      score += 3;
    }

    // Bonus for words with numbers (e.g. "100x", "10k")
    if (/\d/.test(word)) score += 4;

    if (score > bestScore) {
      bestScore = score;
      bestWord = word;
    }
  }

  return bestWord.replace(/[.,!?;:'"()]/g, "");
}

// ===== Generate B-Roll query from segment text =====
export function generateBrollQuery(text: string, preset: PresetType): string {
  if (preset === "futuristic-hud") {
    return `futuristic technology HUD interface, digital hologram, neural network visualization, cinematic, blue cyan glow`;
  }

  // Extract nouns and meaningful words
  const words = text.split(/\s+/);
  const meaningful = words
    .map(w => w.replace(/[.,!?;:'"()]/g, ""))
    .filter(w => w.length > 3)
    .slice(0, 4);

  return `cinematic ${meaningful.join(" ")}, professional photography, high quality, 16:9`;
}

// ===== Build segments from transcription =====
export function buildSegmentsFromTranscription(
  transcriptionSegments: TranscriptionSegment[],
  videoDuration: number,
  existingBroll: { startTime: number; endTime: number }[]
): VideoSegment[] {
  if (transcriptionSegments.length === 0) return [];

  const segments: VideoSegment[] = [];

  for (let i = 0; i < transcriptionSegments.length; i++) {
    const seg = transcriptionSegments[i];
    if (!seg.text || seg.text.trim().length === 0) continue;

    // Check if there's B-Roll overlapping this segment
    const hasBroll = existingBroll.some(
      b => b.startTime < seg.end && b.endTime > seg.start
    );

    const preset = detectPreset(
      { startTime: seg.start, endTime: seg.end, text: seg.text },
      videoDuration,
      i === 0,
      hasBroll
    );

    segments.push({
      id: uuid(),
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text,
      preset,
      keywordHighlight: extractKeywordHighlight(seg.text),
      brollQuery: generateBrollQuery(seg.text, preset),
      confidence: 0.8, // heuristic-based, can be improved with AI
    });
  }

  return segments;
}

// ===== Caption style presets per segment type =====

// ===== Caption style presets — designed for 1-2 word punchy captions =====
// These styles complement the clean, no-background, bold look from the
// Captions app. All presets use transparent background and heavy text shadow
// for readability over video. Sizes are tuned for short text.
//
// Two visual themes are supported:
// - "volt" (default): Neon green highlights, pure white text, energetic
// - "ember": Warm salmon highlights, cream text, editorial/cinematic

const hookCaptionStyle: Partial<CaptionStyle> = {
  fontSize: 72,
  fontWeight: 900,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "center",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 4,
  shadowColor: "rgba(255,215,0,0.6)",
  shadowBlur: 20,
};

const talkingHeadCaptionStyle: Partial<CaptionStyle> = {
  fontSize: 64,
  fontWeight: 900,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 3,
  shadowColor: "rgba(0,0,0,0.9)",
  shadowBlur: 8,
};

const talkingHeadBrollCaptionStyle: Partial<CaptionStyle> = {
  fontSize: 64,
  fontWeight: 900,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 3,
  shadowColor: "rgba(0,0,0,0.9)",
  shadowBlur: 10,
};

const futuristicHudCaptionStyle: Partial<CaptionStyle> = {
  fontFamily: "JetBrains Mono, Fira Code, monospace",
  fontSize: 58,
  fontWeight: 800,
  color: "#00FFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowColor: "rgba(0,255,255,0.5)",
  shadowBlur: 14,
};

// ===== Ember theme overrides =====
// Warm salmon/terracotta palette inspired by Captions "Ember" style
const emberHookCaptionStyle: Partial<CaptionStyle> = {
  ...hookCaptionStyle,
  color: "#F0E6D0", // Warm cream
  shadowColor: "rgba(212,131,92,0.5)",
};

const emberTalkingHeadCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadCaptionStyle,
  color: "#F0E6D0",
};

const emberTalkingHeadBrollCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadBrollCaptionStyle,
  color: "#F0E6D0",
};

// ===== Velocity theme overrides =====
// High-energy yellow/gold palette inspired by Captions "Velocity" style
// Bold italic, metallic golden accents, scanline effects
const velocityHookCaptionStyle: Partial<CaptionStyle> = {
  ...hookCaptionStyle,
  shadowColor: "rgba(255,215,0,0.6)", // Golden glow
  shadowBlur: 24,
  strokeWidth: 3,
};

const velocityTalkingHeadCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadCaptionStyle,
  shadowColor: "rgba(255,215,0,0.5)",
  shadowBlur: 12,
};

const velocityTalkingHeadBrollCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadBrollCaptionStyle,
  shadowColor: "rgba(255,215,0,0.5)",
  shadowBlur: 12,
};

// ===== Heuristic: detect if content is more editorial/lifestyle =====
// Used to automatically choose Ember theme for appropriate content
const EMBER_KEYWORDS = new Set([
  "saúde", "health", "bem-estar", "wellness", "wellbeing",
  "vida", "life", "viver", "live", "qualidade",
  "corpo", "body", "mente", "mind", "alma", "soul",
  "natureza", "nature", "paz", "peace", "calma",
  "meditação", "meditation", "yoga", "respirar", "breathe",
  "exercício", "exercise", "fitness", "treino",
  "alimentação", "nutrition", "dieta", "diet",
  "sono", "sleep", "descanso", "rest",
  "longevidade", "longevity", "envelhecer", "aging",
  "felicidade", "happiness", "gratidão", "gratitude",
  "família", "family", "amor", "love", "relação",
  "aprender", "learn", "educação", "education",
  "livro", "book", "leitura", "reading",
  "viagem", "travel", "aventura", "adventure",
  "arte", "art", "música", "music", "criatividade",
  "produtividade", "productivity", "hábito", "habit",
  "rotina", "routine", "manhã", "morning",
  "sustentável", "sustainable", "orgânico", "organic",
]);

function detectEmberContent(fullText: string): boolean {
  const textLower = fullText.toLowerCase();
  const words = textLower.split(/\s+/);
  let emberScore = 0;
  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "");
    if (EMBER_KEYWORDS.has(cleaned)) emberScore++;
  }
  // If 3+ lifestyle/editorial keywords found, use Ember theme
  return emberScore >= 3;
}

// ===== Velocity keyword detection =====
// High-energy, motivational, business, hustle, competition content → Velocity
const VELOCITY_KEYWORDS = new Set([
  "dinheiro", "money", "cash", "rico", "rich",
  "negócio", "business", "empresa", "company",
  "empreender", "empreendedor", "entrepreneur",
  "sucesso", "success", "vencer", "win", "ganhar",
  "crescer", "grow", "crescimento", "growth",
  "resultado", "result", "meta", "goal", "objetivo",
  "lucro", "profit", "renda", "income", "faturamento",
  "vendas", "sales", "vender", "sell",
  "marketing", "estratégia", "strategy",
  "liderança", "leadership", "líder", "leader",
  "competição", "competition", "competir", "compete",
  "poder", "power", "forte", "strong", "força",
  "velocidade", "speed", "rápido", "fast",
  "energia", "energy", "motivação", "motivation",
  "disciplina", "discipline", "foco", "focus",
  "mentalidade", "mindset", "mental",
  "desafio", "challenge", "superar", "overcome",
  "hustle", "grind", "scale", "escalar",
  "investir", "invest", "patrimônio", "wealth",
  "milionário", "millionaire", "bilionário",
  "liberdade", "freedom", "financeiro", "financial",
  "produtivo", "productive", "performance",
  "atitude", "attitude", "ação", "action",
  "transformar", "transform", "revolução", "revolution",
  "dominar", "dominate", "conquistar", "conquer",
  "impacto", "impact", "influência", "influence",
]);

function detectVelocityContent(fullText: string): boolean {
  const textLower = fullText.toLowerCase();
  const words = textLower.split(/\s+/);
  let velocityScore = 0;
  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "");
    if (VELOCITY_KEYWORDS.has(cleaned)) velocityScore++;
  }
  // If 3+ high-energy/business keywords found, use Velocity theme
  return velocityScore >= 3;
}

// Track which theme should be applied (set during applyAllPresets)
// Priority: velocity > ember > volt (default)
let useEmberTheme = false;
let useVelocityTheme = false;

export function setEmberTheme(enabled: boolean) {
  useEmberTheme = enabled;
}

export function isEmberTheme(): boolean {
  return useEmberTheme;
}

export function setVelocityTheme(enabled: boolean) {
  useVelocityTheme = enabled;
}

export function isVelocityTheme(): boolean {
  return useVelocityTheme;
}

// ===== Apply preset effects to a segment =====
export function applyPresetToSegment(
  segment: VideoSegment,
  captions: Caption[],
  existingEffects: EditEffect[],
  videoDuration: number
): {
  updatedCaptions: Caption[];
  newEffects: EditEffect[];
  newBroll: BRollImage[];
} {
  // Match captions that START within this segment's time range.
  // With gapless 1-2 word captions, a caption may end slightly past the segment
  // boundary (extending until the next caption starts), so we match by startTime.
  const segCaptions = captions.filter(
    c => c.startTime >= segment.startTime - 0.05 && c.startTime < segment.endTime + 0.05
  );

  const newEffects: EditEffect[] = [];
  const newBroll: BRollImage[] = [];

  switch (segment.preset) {
    case "hook":
      return applyHookPreset(segment, segCaptions, videoDuration);
    case "talking-head":
      return applyTalkingHeadPreset(segment, segCaptions, videoDuration);
    case "talking-head-broll":
      return applyTalkingHeadBrollPreset(segment, segCaptions, videoDuration);
    case "futuristic-hud":
      return applyFuturisticHudPreset(segment, segCaptions, videoDuration);
    default:
      return { updatedCaptions: segCaptions, newEffects, newBroll };
  }
}

function applyHookPreset(
  segment: VideoSegment,
  segCaptions: Caption[],
  _videoDuration: number
): {
  updatedCaptions: Caption[];
  newEffects: EditEffect[];
  newBroll: BRollImage[];
} {
  // Style captions: large bold centered with keyword highlight
  // Keep "pop" animation for 1-2 word captions (best for punchy short text)
  const topicLabel = segment.keywordHighlight?.toUpperCase() || "";
  const captionStyle = useVelocityTheme
    ? velocityHookCaptionStyle
    : useEmberTheme ? emberHookCaptionStyle : hookCaptionStyle;
  const usesDualLayer = useEmberTheme || useVelocityTheme;
  const updatedCaptions = segCaptions.map(c => ({
    ...c,
    style: { ...c.style, ...captionStyle },
    animation: "pop" as const,
    emphasis: segment.keywordHighlight ? [segment.keywordHighlight] : c.emphasis,
    emoji: c.emoji,
    // Ember/Velocity: show keyword as large dual-layer label with decorative quotes
    keywordLabel: usesDualLayer && topicLabel.length >= 3 ? topicLabel : undefined,
    keywordQuotes: (usesDualLayer && topicLabel.length >= 3) || undefined,
    topicLabel: !usesDualLayer && topicLabel.length >= 3 ? topicLabel : undefined,
  }));

  const duration = segment.endTime - segment.startTime;
  const newEffects: EditEffect[] = [];

  // Dramatic zoom-in on presenter face (aggressive like Captions app)
  newEffects.push({
    id: `preset_hook_zoom_${segment.id}`,
    type: "zoom-in",
    startTime: segment.startTime,
    endTime: segment.endTime,
    params: {
      scale: 1.55,
      focusX: 0.5,
      focusY: 0.3,
    },
  });

  // Fade-in at beginning
  if (segment.startTime < 0.5) {
    newEffects.push({
      id: `preset_hook_fadein_${segment.id}`,
      type: "transition-fade",
      startTime: 0,
      endTime: Math.min(0.5, duration * 0.3),
      params: { duration: 0.5 },
    });
  }

  // Abrupt cut transition at end (short transition-glitch for urgency)
  newEffects.push({
    id: `preset_hook_cut_${segment.id}`,
    type: "transition-glitch",
    startTime: segment.endTime - 0.15,
    endTime: segment.endTime + 0.1,
    params: { intensity: 3, duration: 0.25 },
  });

  return { updatedCaptions, newEffects, newBroll: [] };
}

function applyTalkingHeadPreset(
  segment: VideoSegment,
  segCaptions: Caption[],
  videoDuration: number
): {
  updatedCaptions: Caption[];
  newEffects: EditEffect[];
  newBroll: BRollImage[];
} {
  // Keep "pop" for 1-2 word short captions; only use "karaoke" for longer ones
  const captionStyle = useVelocityTheme
    ? velocityTalkingHeadCaptionStyle
    : useEmberTheme ? emberTalkingHeadCaptionStyle : talkingHeadCaptionStyle;
  const usesDualLayer = useEmberTheme || useVelocityTheme;
  const updatedCaptions = segCaptions.map(c => {
    const wordCount = c.text.trim().split(/\s+/).length;
    // Ember/Velocity: For 1-2 word punchy captions, show the keyword as large dual-layer
    const isKeywordCaption = !!(usesDualLayer && wordCount <= 2
      && segment.keywordHighlight
      && c.text.toLowerCase().includes(segment.keywordHighlight.toLowerCase()));
    return {
      ...c,
      style: { ...c.style, ...captionStyle },
      animation: wordCount <= 2 ? "pop" as const : "karaoke" as const,
      emphasis: segment.keywordHighlight ? [segment.keywordHighlight] : c.emphasis,
      emoji: c.emoji,
      keywordLabel: isKeywordCaption ? segment.keywordHighlight.toUpperCase() : undefined,
      keywordQuotes: isKeywordCaption || undefined,
    };
  });

  const newEffects: EditEffect[] = [];
  const duration = segment.endTime - segment.startTime;

  // Slow zoom-pulse synchronized with speech rhythm (every 2-4 seconds)
  if (duration > 2) {
    const pulseCount = Math.floor(duration / 3);
    for (let i = 0; i < Math.max(1, pulseCount); i++) {
      const pulseStart = segment.startTime + i * 3;
      const pulseEnd = Math.min(pulseStart + 3, segment.endTime);
      if (pulseEnd - pulseStart < 1) break;

      newEffects.push({
        id: `preset_th_pulse_${segment.id}_${i}`,
        type: i % 2 === 0 ? "zoom-in" : "zoom-out",
        startTime: pulseStart,
        endTime: pulseEnd,
        params: { scale: 1.18, focusX: 0.5, focusY: 0.35 },
      });
    }
  } else {
    // Short segment: single gentle zoom-pulse
    newEffects.push({
      id: `preset_th_zoom_${segment.id}`,
      type: "zoom-pulse",
      startTime: segment.startTime,
      endTime: segment.endTime,
      params: { scale: 1.06 },
    });
  }

  return { updatedCaptions, newEffects, newBroll: [] };
}

function applyTalkingHeadBrollPreset(
  segment: VideoSegment,
  segCaptions: Caption[],
  _videoDuration: number
): {
  updatedCaptions: Caption[];
  newEffects: EditEffect[];
  newBroll: BRollImage[];
} {
  const topicLabel = segment.keywordHighlight?.toUpperCase() || "";
  const captionStyle = useVelocityTheme
    ? velocityTalkingHeadBrollCaptionStyle
    : useEmberTheme ? emberTalkingHeadBrollCaptionStyle : talkingHeadBrollCaptionStyle;
  const usesDualLayer = useEmberTheme || useVelocityTheme;
  const updatedCaptions = segCaptions.map(c => {
    const wordCount = c.text.trim().split(/\s+/).length;
    const isKeywordCaption = !!(usesDualLayer && wordCount <= 2
      && segment.keywordHighlight
      && c.text.toLowerCase().includes(segment.keywordHighlight.toLowerCase()));
    return {
      ...c,
      style: { ...c.style, ...captionStyle },
      animation: wordCount <= 2 ? "pop" as const : "karaoke" as const,
      emphasis: segment.keywordHighlight ? [segment.keywordHighlight] : c.emphasis,
      emoji: c.emoji,
      keywordLabel: isKeywordCaption ? segment.keywordHighlight.toUpperCase() : undefined,
      keywordQuotes: isKeywordCaption || undefined,
      topicLabel: !usesDualLayer && topicLabel.length >= 3 ? topicLabel : undefined,
    };
  });

  const newEffects: EditEffect[] = [];
  const newBroll: BRollImage[] = [];
  const duration = segment.endTime - segment.startTime;

  // B-Roll in the middle ~40-60% of segment
  const brollStart = segment.startTime + duration * 0.2;
  const brollEnd = segment.startTime + duration * 0.75;
  const brollDuration = brollEnd - brollStart;

  if (brollDuration > 0.5) {
    newBroll.push({
      id: `preset_broll_${segment.id}`,
      url: "", // Will be generated
      prompt: segment.brollQuery,
      startTime: brollStart,
      endTime: brollEnd,
      animation: "ken-burns",
      opacity: 0.95,
      position: "fullscreen",
    });

    // Zoom-in on B-Roll for professional camera movement
    newEffects.push({
      id: `preset_thbr_zoom_${segment.id}`,
      type: "zoom-in",
      startTime: brollStart,
      endTime: brollEnd,
      params: { scale: 1.12, focusX: 0.5, focusY: 0.5 },
    });
  }

  return { updatedCaptions, newEffects, newBroll };
}

function applyFuturisticHudPreset(
  segment: VideoSegment,
  segCaptions: Caption[],
  _videoDuration: number
): {
  updatedCaptions: Caption[];
  newEffects: EditEffect[];
  newBroll: BRollImage[];
} {
  const topicLabel = segment.keywordHighlight?.toUpperCase() || "";
  const updatedCaptions = segCaptions.map(c => {
    const wordCount = c.text.trim().split(/\s+/).length;
    return {
      ...c,
      style: { ...c.style, ...futuristicHudCaptionStyle },
      animation: wordCount <= 2 ? "pop" as const : "glow" as const,
      emphasis: segment.keywordHighlight ? [segment.keywordHighlight] : c.emphasis,
      emoji: c.emoji,
      topicLabel: topicLabel.length >= 3 ? topicLabel : undefined,
    };
  });

  const newEffects: EditEffect[] = [];
  const newBroll: BRollImage[] = [];
  const duration = segment.endTime - segment.startTime;

  // Cold color grade (blue/cyan)
  newEffects.push({
    id: `preset_hud_color_${segment.id}`,
    type: "color-grade",
    startTime: segment.startTime,
    endTime: segment.endTime,
    params: { preset: "cold-thriller" },
  });

  // Intense vignette
  newEffects.push({
    id: `preset_hud_vignette_${segment.id}`,
    type: "vignette",
    startTime: segment.startTime,
    endTime: segment.endTime,
    params: { intensity: 0.45 },
  });

  // B-Roll with futuristic theme
  if (duration > 1.5) {
    const brollStart = segment.startTime + duration * 0.15;
    const brollEnd = segment.endTime - duration * 0.1;

    newBroll.push({
      id: `preset_hud_broll_${segment.id}`,
      url: "",
      prompt: segment.brollQuery,
      startTime: brollStart,
      endTime: brollEnd,
      animation: "ken-burns",
      opacity: 0.85,
      position: "fullscreen",
    });

    // Zoom on B-Roll
    newEffects.push({
      id: `preset_hud_zoom_${segment.id}`,
      type: "zoom-pulse",
      startTime: brollStart,
      endTime: brollEnd,
      params: { scale: 1.1 },
    });
  }

  // Glitch transition at segment boundaries
  newEffects.push({
    id: `preset_hud_glitch_${segment.id}`,
    type: "transition-glitch",
    startTime: segment.endTime - 0.2,
    endTime: segment.endTime + 0.1,
    params: { intensity: 4, duration: 0.3 },
  });

  return { updatedCaptions, newEffects, newBroll };
}

// ===== Apply all presets to the entire video =====
export function applyAllPresets(
  segments: VideoSegment[],
  captions: Caption[],
  videoDuration: number
): {
  updatedCaptions: Caption[];
  presetEffects: EditEffect[];
  presetBroll: BRollImage[];
} {
  // Auto-detect theme from content (priority: velocity > ember > volt)
  const fullText = segments.map(s => s.text).join(" ");
  useVelocityTheme = detectVelocityContent(fullText);
  // If Velocity is detected, don't use Ember (they're mutually exclusive)
  useEmberTheme = !useVelocityTheme && detectEmberContent(fullText);

  let allUpdatedCaptions = [...captions];
  const allNewEffects: EditEffect[] = [];
  const allNewBroll: BRollImage[] = [];

  // Remove old preset-generated effects (they start with "preset_")
  // Keep user-added and AI-generated effects

  for (const segment of segments) {
    const result = applyPresetToSegment(
      segment,
      allUpdatedCaptions,
      [],
      videoDuration
    );

    // Replace captions that were updated
    const updatedIds = new Set(result.updatedCaptions.map(c => c.id));
    allUpdatedCaptions = allUpdatedCaptions.map(c =>
      updatedIds.has(c.id)
        ? result.updatedCaptions.find(uc => uc.id === c.id) || c
        : c
    );

    allNewEffects.push(...result.newEffects);
    allNewBroll.push(...result.newBroll);
  }

  // Add global effects that aren't already present
  // Full-duration color-grade
  // Ember theme uses a warmer, more golden color grade; Volt uses cinematic-warm
  const hasGlobalColorGrade = allNewEffects.some(
    e => e.type === "color-grade" && e.endTime - e.startTime > videoDuration * 0.8
  );
  if (!hasGlobalColorGrade) {
    allNewEffects.push({
      id: "preset_global_colorgrade",
      type: "color-grade",
      startTime: 0,
      endTime: videoDuration,
      params: { preset: useVelocityTheme ? "velocity-gold" : useEmberTheme ? "ember-warm" : "cinematic-warm" },
    });
  }

  // Full-duration vignette (Ember uses slightly stronger vignette for editorial feel)
  const hasGlobalVignette = allNewEffects.some(
    e => e.type === "vignette" && e.endTime - e.startTime > videoDuration * 0.8
  );
  if (!hasGlobalVignette) {
    allNewEffects.push({
      id: "preset_global_vignette",
      type: "vignette",
      startTime: 0,
      endTime: videoDuration,
      params: { intensity: useVelocityTheme ? 0.35 : useEmberTheme ? 0.28 : 0.2 },
    });
  }

  return {
    updatedCaptions: allUpdatedCaptions,
    presetEffects: allNewEffects,
    presetBroll: allNewBroll,
  };
}

// ===== Preset display info =====
export const PRESET_INFO: Record<PresetType, {
  label: string;
  labelEn: string;
  color: string;
  bgColor: string;
  description: string;
  icon: string;
}> = {
  "hook": {
    label: "Hook",
    labelEn: "Hook",
    color: "text-red-400",
    bgColor: "bg-red-400/15",
    description: "Prende a atenção nos primeiros segundos",
    icon: "zap",
  },
  "talking-head": {
    label: "Talking Head",
    labelEn: "Talking Head",
    color: "text-blue-400",
    bgColor: "bg-blue-400/15",
    description: "Fala direta com zoom dinâmico",
    icon: "user",
  },
  "talking-head-broll": {
    label: "TH + B-Roll",
    labelEn: "TH + B-Roll",
    color: "text-orange-400",
    bgColor: "bg-orange-400/15",
    description: "Intercala fala com imagens ilustrativas",
    icon: "image",
  },
  "futuristic-hud": {
    label: "HUD Futurista",
    labelEn: "Futuristic HUD",
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/15",
    description: "Visual tech com paleta fria e efeitos digitais",
    icon: "cpu",
  },
};
