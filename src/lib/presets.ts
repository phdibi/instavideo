import { v4 as uuid } from "uuid";
import type {
  VideoSegment,
  PresetType,
  Caption,
  CaptionStyle,
  EditEffect,
  BRollImage,
  TranscriptionSegment,
  ContentPillar,
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

// ===== Authority niche keyword sets =====
const AUTHORITY_AI_KEYWORDS = new Set([
  "diagnóstico", "diagnostico", "implementação", "implementacao",
  "automação", "automacao", "chatbot", "prompt", "agente", "agent",
  "workflow", "pipeline", "framework", "ferramenta", "tool",
  "plataforma", "platform", "consultoria", "consulting",
  "solução", "solucao", "solution", "integração", "integracao",
  "dashboard", "relatório", "relatorio", "report",
  "otimização", "otimizacao", "optimization",
  "processo", "process", "eficiência", "eficiencia",
  "escalabilidade", "scalability", "deploy",
  "aplicativo", "app", "bot", "copilot",
]);

const AUTHORITY_PSYCH_KEYWORDS = new Set([
  "comportamento", "behavior", "behaviour",
  "viés cognitivo", "vies cognitivo", "cognitive bias",
  "heurística", "heuristica", "heuristic",
  "dopamina", "dopamine", "serotonina", "serotonin",
  "cortisol", "adrenalina", "adrenaline",
  "amígdala", "amigdala", "hipocampo", "hippocampus",
  "córtex", "cortex", "pré-frontal", "prefrontal",
  "neuroplasticidade", "neuroplasticity",
  "inconsciente", "subconscious", "consciência", "consciencia",
  "emoção", "emocao", "emotion", "afeto", "affect",
  "percepção", "percepcao", "perception",
  "atenção", "atencao", "attention",
  "motivação", "motivacao", "motivation",
  "recompensa", "reward", "punição", "punicao",
  "hábito", "habito", "habit", "condicionamento", "conditioning",
  "terapia", "therapy", "psicoterapia", "psychotherapy",
  "ansiedade", "anxiety", "estresse", "stress",
  "cognição", "cognicao", "cognition", "metacognição", "metacognicao",
  "psicologia", "psychology", "neurociência", "neurociencia", "neuroscience",
  "cérebro", "cerebro", "brain", "mente", "mind",
  "memória", "memoria", "memory",
  "aprendizagem", "learning", "tomada de decisão", "decision making",
  "viés", "vies", "bias", "priming", "ancoragem", "anchoring",
  "resiliência", "resiliencia", "resilience",
  "inteligência emocional", "inteligencia emocional", "emotional intelligence",
  "autoconhecimento", "self-knowledge", "autocontrole", "self-control",
]);

const AUTHORITY_RESULTS_KEYWORDS = new Set([
  "resultado", "result", "transformação", "transformacao", "transformation",
  "case", "caso", "roi", "retorno", "return",
  "antes", "depois", "before", "after",
  "crescimento", "growth", "aumento", "increase",
  "redução", "reducao", "reduction", "economia", "saving",
  "cliente", "client", "empresa", "company",
  "implementação", "implementacao", "implementation",
  "sucesso", "success", "impacto", "impact",
  "métricas", "metricas", "metrics", "kpi",
  "faturamento", "revenue", "conversão", "conversao", "conversion",
  "produtividade", "productivity", "desempenho", "performance",
]);

// ===== Detect preset for a segment =====
// SIMPLIFIED: Professional approach — mostly talking-head with sparse B-Roll.
// Research shows pro apps use B-roll every 15-30s, not every 3rd segment.
let _segmentCounter = 0;
let _lastBrollTime = -Infinity;
export function resetSegmentCounter() { _segmentCounter = 0; _lastBrollTime = -Infinity; }

export function detectPreset(
  segment: { startTime: number; endTime: number; text: string },
  videoDuration: number,
  isFirst: boolean,
  hasBrollAvailable: boolean
): PresetType {
  _segmentCounter++;

  // Rule 1: First segment within 5s = HOOK (only visual difference: slightly stronger zoom)
  if (isFirst && segment.startTime < 5) {
    return "hook";
  }

  const segDuration = segment.endTime - segment.startTime;
  const timeSinceLastBroll = segment.startTime - _lastBrollTime;

  // Rule 2: B-Roll only every ~15-20 seconds, and only for segments with visual content.
  // This matches professional standards (2-3 B-roll per minute max).
  if (timeSinceLastBroll >= 15 && segDuration > 2) {
    const textLower = segment.text.toLowerCase();
    const words = textLower.split(/\s+/);
    let visualScore = 0;
    for (const word of words) {
      const cleaned = word.replace(/[.,!?;:'"()]/g, "");
      if (VISUAL_CONTENT_KEYWORDS.has(cleaned)) visualScore++;
    }
    // Only add B-roll if there's meaningful visual content to illustrate
    if (visualScore >= 2 || (hasBrollAvailable && visualScore >= 1)) {
      _lastBrollTime = segment.startTime;
      return "talking-head-broll";
    }
  }

  // Rule 3: Everything else is talking-head (the consistent, clean look)
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
    if (AUTHORITY_AI_KEYWORDS.has(cleaned)) score += 10;
    if (AUTHORITY_PSYCH_KEYWORDS.has(cleaned)) score += 10;
    if (AUTHORITY_RESULTS_KEYWORDS.has(cleaned)) score += 8;

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
  // Extract nouns and meaningful words
  const words = text.split(/\s+/);
  const meaningful = words
    .map(w => w.replace(/[.,!?;:'"()]/g, ""))
    .filter(w => w.length > 3)
    .slice(0, 4);

  if (useAuthorityTheme) {
    const segLean = detectSegmentLean(text);
    if (segLean === "teal") {
      return `futuristic professional office with AI dashboard, holographic neural network interface, cool blue-teal cinematic lighting, data analytics visualization, modern technology, ${meaningful.join(" ")}`;
    } else if (segLean === "amber") {
      return `cinematic brain neural pathways visualization, warm amber golden lighting, professional psychology consultation, human connection, neuroscience concept art, ${meaningful.join(" ")}`;
    }
    return `modern professional consulting environment, AI and human collaboration, cinematic lighting, data-driven insights, ${meaningful.join(" ")}`;
  }

  if (preset === "futuristic-hud") {
    return `futuristic technology HUD interface, digital hologram, neural network visualization, cinematic, blue cyan glow`;
  }

  return `cinematic ${meaningful.join(" ")}, professional photography, high quality, 16:9`;
}

// ===== Build segments from transcription =====
export function buildSegmentsFromTranscription(
  transcriptionSegments: TranscriptionSegment[],
  videoDuration: number,
  existingBroll: { startTime: number; endTime: number }[]
): VideoSegment[] {
  if (transcriptionSegments.length === 0) return [];
  resetSegmentCounter();

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

  // Extend the LAST segment to cover the full video duration.
  // After the speaker finishes, there may be several seconds of silence
  // before the video ends. Without this, that tail has no segment → no
  // preset, no effects, and the timeline looks "compressed" at the end.
  if (segments.length > 0 && videoDuration > 0) {
    const lastSeg = segments[segments.length - 1];
    if (lastSeg.endTime < videoDuration - 0.1) {
      lastSeg.endTime = videoDuration;
    }
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
  fontSize: 68,
  fontWeight: 900,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "center",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 3,
  shadowColor: "rgba(255,215,0,0.35)",
  shadowBlur: 14,
};

const talkingHeadCaptionStyle: Partial<CaptionStyle> = {
  fontSize: 58,
  fontWeight: 800,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 2.5,
  shadowColor: "rgba(0,0,0,0.85)",
  shadowBlur: 6,
};

const talkingHeadBrollCaptionStyle: Partial<CaptionStyle> = {
  fontSize: 58,
  fontWeight: 800,
  color: "#FFFFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 2.5,
  shadowColor: "rgba(0,0,0,0.85)",
  shadowBlur: 8,
};

const futuristicHudCaptionStyle: Partial<CaptionStyle> = {
  fontFamily: "JetBrains Mono, Fira Code, monospace",
  fontSize: 54,
  fontWeight: 700,
  color: "#00FFFF",
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  position: "bottom",
  textAlign: "center",
  strokeColor: "#000000",
  strokeWidth: 2,
  shadowColor: "rgba(0,255,255,0.35)",
  shadowBlur: 10,
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
  shadowColor: "rgba(255,215,0,0.35)", // Subtle golden glow
  shadowBlur: 14,
  strokeWidth: 3,
};

const velocityTalkingHeadCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadCaptionStyle,
  shadowColor: "rgba(255,215,0,0.3)",
  shadowBlur: 8,
};

const velocityTalkingHeadBrollCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadBrollCaptionStyle,
  shadowColor: "rgba(255,215,0,0.3)",
  shadowBlur: 8,
};

// ===== Authority theme overrides =====
// Professional deep palette: teal (#00D4AA) for AI, amber (#E8A838) for psychology
// Design: clean, confident, refined — conveys expertise without being flashy.
// Uses Inter for clean sans-serif readability, slightly reduced sizes for elegance,
// weight 800 (not 900) for refined boldness, subtle shadow instead of neon glow,
// and letter-spacing for professional look.
const AUTHORITY_TEAL = "#00D4AA";
const AUTHORITY_AMBER = "#E8A838";

const authorityHookCaptionStyle: Partial<CaptionStyle> = {
  ...hookCaptionStyle,
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 70,          // Slightly smaller than default 72 — confident, not shouting
  fontWeight: 800,       // Extra-bold (refined, not ultra-black 900)
  color: "#F8F8F8",      // Slightly warm white — softer, more professional
  strokeWidth: 2.5,      // Thinner stroke — cleaner look
  strokeColor: "rgba(0,0,0,0.85)",
  shadowColor: "rgba(0,212,170,0.3)", // Subtle teal glow (not neon)
  shadowBlur: 12,        // Tighter shadow — sharper text
  letterSpacing: "0.02em",
};

const authorityTalkingHeadCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadCaptionStyle,
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 58,          // Slightly smaller — refined reading
  fontWeight: 700,       // Bold (not ultra-bold — professional subtlety)
  color: "#F0F0F0",
  strokeWidth: 2,
  strokeColor: "rgba(0,0,0,0.8)",
  shadowColor: "rgba(0,212,170,0.25)", // Very subtle teal depth
  shadowBlur: 6,         // Tight, clean
  letterSpacing: "0.01em",
};

const authorityTalkingHeadBrollCaptionStyle: Partial<CaptionStyle> = {
  ...talkingHeadBrollCaptionStyle,
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 58,
  fontWeight: 700,
  color: "#F0F0F0",
  strokeWidth: 2,
  strokeColor: "rgba(0,0,0,0.8)",
  shadowColor: "rgba(0,212,170,0.25)",
  shadowBlur: 8,
  letterSpacing: "0.01em",
};

// ===== Heuristic: detect if content is more editorial/lifestyle =====
// Used to automatically choose Ember theme for appropriate content
const EMBER_KEYWORDS = new Set([
  "saúde", "health", "bem-estar", "wellness", "wellbeing",
  "mental", "psicológico", "psychological", "emocional", "emotional",
  "vida", "life", "viver", "live", "qualidade",
  "corpo", "body", "mente", "mind", "alma", "soul",
  "cérebro", "brain", "neurociência", "neuroscience", "neurônio",
  "memória", "memory", "cognição", "cognitive", "cognitivo",
  "comportamento", "behavior", "behaviour", "hábito", "habit",
  "processo", "compreensão", "funcionalidade",
  "natureza", "nature", "paz", "peace", "calma",
  "meditação", "meditation", "yoga", "respirar", "breathe",
  "exercício", "exercise", "fitness", "treino",
  "alimentação", "nutrition", "dieta", "diet",
  "sono", "sleep", "descanso", "rest",
  "terapia", "therapy", "ansiedade", "anxiety", "depressão",
  "consciência", "awareness", "mindfulness", "autocuidado",
  "longevidade", "longevity", "envelhecer", "aging",
  "felicidade", "happiness", "gratidão", "gratitude",
  "família", "family", "amor", "love", "relação",
  "aprender", "learn", "educação", "education",
  "livro", "book", "leitura", "reading",
  "viagem", "travel", "aventura", "adventure",
  "arte", "art", "música", "music", "criatividade",
  "produtividade", "productivity",
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
  "mentalidade", "mindset",
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
// Priority: authority > velocity > ember > volt (default)
let useEmberTheme = false;
let useVelocityTheme = false;
let useAuthorityTheme = false;
let authorityLean: "teal" | "amber" | "blended" = "blended";

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

export function setAuthorityTheme(enabled: boolean) {
  useAuthorityTheme = enabled;
}

export function isAuthorityTheme(): boolean {
  return useAuthorityTheme;
}

export function getAuthorityLean(): "teal" | "amber" | "blended" {
  return authorityLean;
}

export function setAuthorityLean(lean: "teal" | "amber" | "blended") {
  authorityLean = lean;
}

// ===== Authority content detection =====
function detectAuthorityContent(fullText: string): { isAuthority: boolean; lean: "teal" | "amber" | "blended" } {
  const textLower = fullText.toLowerCase();
  const words = textLower.split(/\s+/);
  let aiScore = 0;
  let psychScore = 0;

  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "");
    if (AUTHORITY_AI_KEYWORDS.has(cleaned) || FUTURISTIC_KEYWORDS.has(cleaned)) aiScore++;
    if (AUTHORITY_PSYCH_KEYWORDS.has(cleaned) || EMBER_KEYWORDS.has(cleaned)) psychScore++;
    if (AUTHORITY_RESULTS_KEYWORDS.has(cleaned)) { aiScore += 0.5; psychScore += 0.5; }
  }
  // Check 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words[i].replace(/[.,!?;:'"()]/g, "") + " " + words[i + 1].replace(/[.,!?;:'"()]/g, "");
    if (AUTHORITY_AI_KEYWORDS.has(phrase) || FUTURISTIC_KEYWORDS.has(phrase)) aiScore += 2;
    if (AUTHORITY_PSYCH_KEYWORDS.has(phrase)) psychScore += 2;
  }

  const total = aiScore + psychScore;
  if (total < 3) return { isAuthority: false, lean: "blended" };

  const lean = aiScore > psychScore * 1.5 ? "teal"
    : psychScore > aiScore * 1.5 ? "amber"
    : "blended";

  return { isAuthority: true, lean };
}

export function detectSegmentLean(text: string): "teal" | "amber" | "blended" {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  let aiScore = 0;
  let psychScore = 0;

  for (const word of words) {
    const cleaned = word.replace(/[.,!?;:'"()]/g, "");
    if (AUTHORITY_AI_KEYWORDS.has(cleaned) || FUTURISTIC_KEYWORDS.has(cleaned)) aiScore++;
    if (AUTHORITY_PSYCH_KEYWORDS.has(cleaned)) psychScore++;
  }

  if (aiScore > psychScore) return "teal";
  if (psychScore > aiScore) return "amber";
  return "blended";
}

// Force theme based on content pillar selection
export function forceThemeFromPillar(pillar: ContentPillar) {
  switch (pillar) {
    case "ia-tech":
      useAuthorityTheme = true;
      authorityLean = "teal";
      useEmberTheme = false;
      useVelocityTheme = false;
      break;
    case "psych-neuro":
      useAuthorityTheme = true;
      authorityLean = "amber";
      useEmberTheme = false;
      useVelocityTheme = false;
      break;
    case "intersection":
      useAuthorityTheme = true;
      authorityLean = "blended";
      useEmberTheme = false;
      useVelocityTheme = false;
      break;
    case "cases":
      useAuthorityTheme = true;
      authorityLean = "blended";
      useEmberTheme = false;
      useVelocityTheme = false;
      break;
    case "quick-tips":
      // Auto-detect normally
      break;
  }
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
  const captionStyle = useAuthorityTheme
    ? authorityHookCaptionStyle
    : useVelocityTheme
      ? velocityHookCaptionStyle
      : useEmberTheme ? emberHookCaptionStyle : hookCaptionStyle;
  const usesDualLayer = useEmberTheme || useVelocityTheme || useAuthorityTheme;
  // Controlled, confident entrance for all themes — calm and elegant
  const hookAnimation = "slide-up" as const;
  const updatedCaptions = segCaptions.map(c => ({
    ...c,
    style: { ...c.style, ...captionStyle },
    animation: hookAnimation,
    emphasis: segment.keywordHighlight ? [segment.keywordHighlight] : c.emphasis,
    emoji: c.emoji,
    // Ember/Velocity: show keyword as large dual-layer label with decorative quotes
    keywordLabel: usesDualLayer && topicLabel.length >= 3 ? topicLabel : undefined,
    keywordQuotes: (usesDualLayer && topicLabel.length >= 3) || undefined,
    topicLabel: !usesDualLayer && topicLabel.length >= 3 ? topicLabel : undefined,
  }));

  const duration = segment.endTime - segment.startTime;
  const newEffects: EditEffect[] = [];

  // Professional punch-in zoom on face — noticeable but not aggressive (1.15x, not 1.25x)
  newEffects.push({
    id: `preset_hook_zoom_${segment.id}`,
    type: "zoom-in",
    startTime: segment.startTime,
    endTime: segment.endTime,
    params: {
      scale: 1.15,
      focusX: 0.5,
      focusY: 0.35,
    },
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
  const captionStyle = useAuthorityTheme
    ? authorityTalkingHeadCaptionStyle
    : useVelocityTheme
      ? velocityTalkingHeadCaptionStyle
      : useEmberTheme ? emberTalkingHeadCaptionStyle : talkingHeadCaptionStyle;
  const usesDualLayer = useEmberTheme || useVelocityTheme || useAuthorityTheme;
  const updatedCaptions = segCaptions.map(c => {
    const wordCount = c.text.trim().split(/\s+/).length;
    const isKeywordCaption = !!(usesDualLayer && wordCount <= 2
      && segment.keywordHighlight
      && c.text.toLowerCase().includes(segment.keywordHighlight.toLowerCase()));
    const animation = wordCount <= 2 ? "fade" as const : "slide-up" as const;
    return {
      ...c,
      style: { ...c.style, ...captionStyle },
      animation,
      emphasis: segment.keywordHighlight ? [segment.keywordHighlight] : c.emphasis,
      emoji: c.emoji,
      keywordLabel: isKeywordCaption ? segment.keywordHighlight.toUpperCase() : undefined,
      keywordQuotes: isKeywordCaption || undefined,
    };
  });

  const newEffects: EditEffect[] = [];

  // IMPORTANT: Zooms are NOT applied per-segment here.
  // Instead, applyAllPresets selects the top ~20-25% of segments for zooms
  // to match professional editing standards (2-4 zooms per minute).
  // Individual segments only get effects if explicitly scored as "zoom-worthy"
  // by the parent function. This prevents visual clutter.

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
  const captionStyle = useAuthorityTheme
    ? authorityTalkingHeadBrollCaptionStyle
    : useVelocityTheme
      ? velocityTalkingHeadBrollCaptionStyle
      : useEmberTheme ? emberTalkingHeadBrollCaptionStyle : talkingHeadBrollCaptionStyle;
  const usesDualLayer = useEmberTheme || useVelocityTheme || useAuthorityTheme;
  const updatedCaptions = segCaptions.map(c => {
    const wordCount = c.text.trim().split(/\s+/).length;
    const isKeywordCaption = !!(usesDualLayer && wordCount <= 2
      && segment.keywordHighlight
      && c.text.toLowerCase().includes(segment.keywordHighlight.toLowerCase()));
    // Clean, calm animations — "fade" for short, "slide-up" for longer
    const animation = wordCount <= 2 ? "fade" as const : "slide-up" as const;
    return {
      ...c,
      style: { ...c.style, ...captionStyle },
      animation,
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
    // Professional animation variety: alternate between cinematic styles
    const brollAnims = ["cinematic-reveal", "ken-burns", "parallax", "zoom"] as const;
    const animIdx = Math.abs(segment.id.charCodeAt(segment.id.length - 1)) % brollAnims.length;
    newBroll.push({
      id: `preset_broll_${segment.id}`,
      url: "", // Will be generated
      prompt: segment.brollQuery,
      startTime: brollStart,
      endTime: brollEnd,
      animation: brollAnims[animIdx],
      opacity: 0.95,
      position: "fullscreen",
      cinematicOverlay: true,
    });

    // Gentle zoom on B-Roll — subtle camera movement, let the image speak
    newEffects.push({
      id: `preset_thbr_zoom_${segment.id}`,
      type: "zoom-in",
      startTime: brollStart,
      endTime: brollEnd,
      params: { scale: 1.06, focusX: 0.5, focusY: 0.5 },
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
      animation: wordCount <= 2 ? "fade" as const : "glow" as const,
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

  // Moderate vignette — elegant, not heavy
  newEffects.push({
    id: `preset_hud_vignette_${segment.id}`,
    type: "vignette",
    startTime: segment.startTime,
    endTime: segment.endTime,
    params: { intensity: 0.30 },
  });

  // B-Roll with futuristic theme
  if (duration > 1.5) {
    const brollStart = segment.startTime + duration * 0.15;
    const brollEnd = segment.endTime - duration * 0.1;

    // Futuristic: use glitch-in for sci-fi feel
    newBroll.push({
      id: `preset_hud_broll_${segment.id}`,
      url: "",
      prompt: segment.brollQuery,
      startTime: brollStart,
      endTime: brollEnd,
      animation: "glitch-in",
      opacity: 0.85,
      position: "fullscreen",
      cinematicOverlay: true,
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

  // Clean fade transition at segment boundaries
  newEffects.push({
    id: `preset_hud_fade_${segment.id}`,
    type: "transition-fade",
    startTime: segment.endTime - 0.2,
    endTime: segment.endTime + 0.1,
    params: { duration: 0.3 },
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
  // Auto-detect theme from content (priority: authority > velocity > ember > volt)
  const fullText = segments.map(s => s.text).join(" ");

  // Check for authority content first (unless already forced by pillar)
  if (!useAuthorityTheme) {
    const authorityResult = detectAuthorityContent(fullText);
    useAuthorityTheme = authorityResult.isAuthority;
    authorityLean = authorityResult.lean;
  }

  if (useAuthorityTheme) {
    useVelocityTheme = false;
    useEmberTheme = false;
  } else {
    useVelocityTheme = detectVelocityContent(fullText);
    useEmberTheme = !useVelocityTheme && detectEmberContent(fullText);
  }

  let allUpdatedCaptions = [...captions];
  const allNewEffects: EditEffect[] = [];
  const allNewBroll: BRollImage[] = [];

  // Step 1: Apply caption styling from each preset (no effects yet)
  for (const segment of segments) {
    const result = applyPresetToSegment(segment, allUpdatedCaptions, [], videoDuration);
    const updatedIds = new Set(result.updatedCaptions.map(c => c.id));
    allUpdatedCaptions = allUpdatedCaptions.map(c =>
      updatedIds.has(c.id) ? result.updatedCaptions.find(uc => uc.id === c.id) || c : c
    );
    allNewEffects.push(...result.newEffects);
    allNewBroll.push(...result.newBroll);
  }

  // Step 2: SELECTIVE ZOOMS — only ~20-25% of segments get zoom effects.
  // Professional standard: 2-4 zooms per minute, triggered by content importance.
  // Score each segment, pick the top ~25%, apply varied zoom styles.
  const zoomCandidates = segments
    .filter(s => s.preset !== "hook") // Hook already has its own zoom
    .map((seg, _idx) => {
      let score = 0;
      const dur = seg.endTime - seg.startTime;
      const wordCount = seg.text.trim().split(/\s+/).length;
      const textLower = seg.text.toLowerCase();

      // Short punchy phrases are zoom-worthy
      if (dur < 2.5 && wordCount <= 6) score += 4;
      // Longer segments need keyword justification
      if (dur > 4) score -= 1;
      // Keywords indicate importance
      for (const word of textLower.split(/\s+/)) {
        const cleaned = word.replace(/[.,!?;:'"()]/g, "");
        if (AUTHORITY_AI_KEYWORDS.has(cleaned) || AUTHORITY_PSYCH_KEYWORDS.has(cleaned)) score += 2;
        if (AUTHORITY_RESULTS_KEYWORDS.has(cleaned)) score += 2;
        if (FUTURISTIC_KEYWORDS.has(cleaned)) score += 1;
      }
      // Segments too short to notice
      if (dur < 0.5) score -= 10;
      return { seg, score, dur };
    });

  // Pick top ~25% for zooms (min 1, max ~4 per minute)
  const maxZooms = Math.max(1, Math.ceil(segments.length * 0.25));
  const zoomWinners = new Set(
    zoomCandidates
      .filter(c => c.score > 0 && c.dur >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxZooms)
      .map(c => c.seg.id)
  );

  // Apply zoom effects only to winners
  const zoomStyles: Array<{ type: "zoom-in" | "zoom-out" | "zoom-pulse"; params: Record<string, number> }> = [
    { type: "zoom-in", params: { scale: 1.12, focusX: 0.5, focusY: 0.35 } },
    { type: "zoom-out", params: { scale: 1.08 } },
    { type: "zoom-in", params: { scale: 1.08, focusX: 0.45, focusY: 0.38 } },
    { type: "zoom-in", params: { scale: 1.08, focusX: 0.55, focusY: 0.38 } },
  ];

  let zoomIdx = 0;
  for (const seg of segments) {
    if (!zoomWinners.has(seg.id)) continue;
    const style = zoomStyles[zoomIdx % zoomStyles.length];
    allNewEffects.push({
      id: `preset_th_zoom_${seg.id}`,
      type: style.type,
      startTime: seg.startTime,
      endTime: seg.endTime,
      params: style.params,
    });
    zoomIdx++;
  }

  // Step 3: NO auto-transitions. Professional standard: hard cuts 90% of the time.
  // Users can manually add transitions via the editor if desired.

  // Step 4: Global effects — single consistent look for the whole video
  allNewEffects.push({
    id: "preset_global_colorgrade",
    type: "color-grade",
    startTime: 0,
    endTime: videoDuration,
    params: { preset: useAuthorityTheme ? "authority-deep" : useVelocityTheme ? "velocity-gold" : useEmberTheme ? "ember-warm" : "cinematic-warm" },
  });

  allNewEffects.push({
    id: "preset_global_vignette",
    type: "vignette",
    startTime: 0,
    endTime: videoDuration,
    params: { intensity: useAuthorityTheme ? 0.18 : 0.15 },
  });

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
