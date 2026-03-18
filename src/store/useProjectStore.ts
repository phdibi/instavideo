import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type {
  Caption,
  CaptionConfig,
  EditEffect,
  BRollImage,
  EditPlan,
  ProjectStatus,
  TeleprompterSettings,
  VideoSegment,
  BrandingConfig,
  SFXConfig,
  SFXMarker,
  ModeSegment,
  PhraseCaption,
  MusicConfig,
  StanzaConfig,
  TranscriptionResult,
  VoiceEnhanceConfig,
} from "@/types";

interface ProjectStore {
  videoFile: File | null;
  videoUrl: string;
  videoDuration: number;
  status: ProjectStatus;
  statusMessage: string;
  captions: Caption[];
  effects: EditEffect[];
  bRollImages: BRollImage[];
  editPlan: EditPlan | null;
  currentTime: number;
  isPlaying: boolean;
  segments: VideoSegment[];
  selectedItem: { type: "caption" | "effect" | "broll" | "segment" | "phrase" | "sfx"; id: string } | null;
  selectedItems: { type: "caption" | "effect" | "broll" | "segment" | "phrase" | "sfx"; id: string }[];
  teleprompterSettings: TeleprompterSettings;
  brandingConfig: BrandingConfig;
  sfxConfig: SFXConfig;
  sfxMarkers: SFXMarker[];
  modeSegments: ModeSegment[];
  phraseCaptions: PhraseCaption[];
  musicConfig: MusicConfig;
  selectedMusicTrack: string | null;
  captionConfig: CaptionConfig;
  stanzaConfig: StanzaConfig;
  stanzaStyleOverrides: Record<string, Partial<StanzaConfig>>;
  transcriptionResult: TranscriptionResult | null;
  voiceEnhanceConfig: VoiceEnhanceConfig;

  setStanzaConfig: (config: Partial<StanzaConfig>) => void;
  setStanzaOverride: (stanzaId: string, override: Partial<StanzaConfig>) => void;
  setVoiceEnhanceConfig: (config: Partial<VoiceEnhanceConfig>) => void;
  setTranscriptionResult: (result: TranscriptionResult | null) => void;
  setSFXMarkers: (markers: SFXMarker[]) => void;
  addSFXMarker: (marker: SFXMarker) => void;
  updateSFXMarker: (id: string, updates: Partial<SFXMarker>) => void;
  deleteSFXMarker: (id: string) => void;
  setCaptionConfig: (config: Partial<CaptionConfig>) => void;
  setModeSegments: (segments: ModeSegment[]) => void;
  updateModeSegment: (id: string, updates: Partial<ModeSegment>) => void;
  setPhraseCaptions: (captions: PhraseCaption[]) => void;
  addPhraseCaption: (caption: PhraseCaption) => void;
  updatePhraseCaption: (id: string, updates: Partial<PhraseCaption>) => void;
  deletePhraseCaption: (id: string) => void;
  setMusicConfig: (config: Partial<MusicConfig>) => void;
  setSelectedMusicTrack: (trackId: string | null) => void;
  setSegments: (segments: VideoSegment[]) => void;
  updateSegment: (id: string, updates: Partial<VideoSegment>) => void;
  deleteSegment: (id: string) => void;
  setVideoFile: (file: File) => void;
  setVideoUrl: (url: string) => void;
  setVideoDuration: (duration: number) => void;
  setStatus: (status: ProjectStatus, message?: string) => void;
  setCaptions: (captions: Caption[]) => void;
  updateCaption: (id: string, updates: Partial<Caption>) => void;
  deleteCaption: (id: string) => void;
  setEffects: (effects: EditEffect[]) => void;
  updateEffect: (id: string, updates: Partial<EditEffect>) => void;
  deleteEffect: (id: string) => void;
  setBRollImages: (images: BRollImage[]) => void;
  updateBRollImage: (id: string, updates: Partial<BRollImage>) => void;
  deleteBRollImage: (id: string) => void;
  setEditPlan: (plan: EditPlan) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedItem: (item: { type: "caption" | "effect" | "broll" | "segment" | "phrase" | "sfx"; id: string } | null) => void;
  toggleSelectedItem: (item: { type: "caption" | "effect" | "broll" | "segment" | "phrase" | "sfx"; id: string }) => void;
  setTeleprompterSettings: (settings: Partial<TeleprompterSettings>) => void;
  setBrandingConfig: (config: Partial<BrandingConfig>) => void;
  setSFXConfig: (config: Partial<SFXConfig>) => void;
  deleteModeSegment: (id: string) => void;
  splitSegmentForBroll: (id: string, atTime: number) => void;
  /** Apply a style override to ALL phraseCaptions */
  applyStyleOverrideToAll: (override: Partial<CaptionConfig>) => void;
  /** Batch offset multiple items by a time delta — for Shift multi-select bulk editing */
  batchOffsetItems: (items: { type: "caption" | "effect" | "broll" | "segment"; id: string }[], deltaTime: number) => void;
  reset: () => void;
}

const defaultTeleprompterSettings: TeleprompterSettings = {
  script: "",
  fontSize: 32,
  scrollSpeed: 3,
  mirrorText: false,
  showTimer: true,
  countdownSeconds: 3,
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  opacity: 0.85,
  lineHeight: 1.6,
  paddingHorizontal: 10,
  cueLinePosition: 35,
};

const defaultBrandingConfig: BrandingConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Pedro Della Giustina",
  title: process.env.NEXT_PUBLIC_BRAND_TITLE || "Consultor de IA | Psicólogo",
  showWatermark: true,
  showCTA: true,
  ctaTemplate: "siga",
  contentPillar: "ia-tech",
};

const defaultSFXConfig: SFXConfig = {
  profile: "cinematic",
  masterVolume: 0.5,
  hookImpact: true,
  hookRise: true,
  brollEnter: true,
  brollExit: false,
  segmentChange: false,
};

const defaultMusicConfig: MusicConfig = {
  trackId: null,
  baseVolume: 0.30,
  duckVolume: 0.15,
  fadeInDuration: 0.5,
  fadeOutDuration: 0.5,
};

const defaultStanzaConfig: StanzaConfig = {
  enabled: true,
  intervalSeconds: 4,
  wordsPerStanza: 3,
  emphasisFontSize: 60,
  normalFontSize: 26,
  emphasisFontFamily: "Playfair Display",
  normalFontFamily: "Montserrat",
  stanzaLayout: "cascading",
};

const defaultCaptionConfig: CaptionConfig = {
  fontFamily: "Montserrat",
  fontSize: 48,
  fontWeight: 800,
  color: "#FFFFFF",
  strokeColor: "#000000",
  strokeWidth: 0,
  shadowColor: "rgba(0,0,0,0.85)",
  shadowBlur: 10,
  position: "bottom",
  animation: "pop",
  uppercase: true,
  letterSpacing: 0.02,
};


const initialState = {
  videoFile: null,
  videoUrl: "",
  videoDuration: 0,
  status: "idle" as ProjectStatus,
  statusMessage: "",
  captions: [],
  effects: [],
  bRollImages: [],
  editPlan: null,
  segments: [],
  currentTime: 0,
  isPlaying: false,
  selectedItem: null,
  selectedItems: [],
  teleprompterSettings: { ...defaultTeleprompterSettings },
  brandingConfig: { ...defaultBrandingConfig },
  sfxConfig: { ...defaultSFXConfig },
  sfxMarkers: [],
  modeSegments: [],
  phraseCaptions: [],
  musicConfig: { ...defaultMusicConfig },
  selectedMusicTrack: null,
  captionConfig: { ...defaultCaptionConfig },
  stanzaConfig: { ...defaultStanzaConfig },
  stanzaStyleOverrides: {},
  transcriptionResult: null,
  voiceEnhanceConfig: { preset: "off" as const, intensity: 1.0 },
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
  ...initialState,

  setVideoFile: (file) => set({ videoFile: file }),
  setVideoUrl: (url) => set({ videoUrl: url }),
  setVideoDuration: (duration) => set({ videoDuration: duration }),
  setStatus: (status, message) =>
    set({ status, statusMessage: message || "" }),
  setCaptions: (captions) => set({ captions }),
  updateCaption: (id, updates) =>
    set((state) => {
      const updated = state.captions.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      );
      // Re-sort only if timing changed to keep order consistent
      if ('startTime' in updates || 'endTime' in updates) {
        updated.sort((a, b) => a.startTime - b.startTime);
      }
      return { captions: updated };
    }),
  deleteCaption: (id) =>
    set((state) => ({
      captions: state.captions.filter((c) => c.id !== id),
    })),
  setEffects: (effects) => set({ effects }),
  updateEffect: (id, updates) =>
    set((state) => {
      const updated = state.effects.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      );
      if ('startTime' in updates || 'endTime' in updates) {
        updated.sort((a, b) => a.startTime - b.startTime);
      }
      return { effects: updated };
    }),
  deleteEffect: (id) =>
    set((state) => ({
      effects: state.effects.filter((e) => e.id !== id),
    })),
  setBRollImages: (images) => set({ bRollImages: images }),
  updateBRollImage: (id, updates) =>
    set((state) => {
      const updated = state.bRollImages.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      );
      if ('startTime' in updates || 'endTime' in updates) {
        updated.sort((a, b) => a.startTime - b.startTime);
      }
      return { bRollImages: updated };
    }),
  deleteBRollImage: (id) =>
    set((state) => ({
      bRollImages: state.bRollImages.filter((b) => b.id !== id),
    })),
  setCaptionConfig: (config) =>
    set((state) => ({
      captionConfig: { ...state.captionConfig, ...config },
    })),
  setStanzaConfig: (config) =>
    set((state) => ({
      stanzaConfig: { ...state.stanzaConfig, ...config },
    })),
  setStanzaOverride: (stanzaId, override) =>
    set((state) => ({
      stanzaStyleOverrides: {
        ...state.stanzaStyleOverrides,
        [stanzaId]: { ...state.stanzaStyleOverrides[stanzaId], ...override },
      },
    })),
  setVoiceEnhanceConfig: (config) =>
    set((state) => ({
      voiceEnhanceConfig: { ...state.voiceEnhanceConfig, ...config },
    })),
  setTranscriptionResult: (result) => set({ transcriptionResult: result }),
  setModeSegments: (segments) => set({ modeSegments: segments }),
  updateModeSegment: (id, updates) =>
    set((state) => {
      const updated = state.modeSegments.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      // Re-sort if timing changed to keep binary search in getCurrentMode correct
      if ('startTime' in updates || 'endTime' in updates) {
        updated.sort((a, b) => a.startTime - b.startTime);
      }
      return { modeSegments: updated };
    }),
  setPhraseCaptions: (captions) => set({ phraseCaptions: captions }),
  addPhraseCaption: (caption) =>
    set((state) => ({
      phraseCaptions: [...state.phraseCaptions, caption]
        .sort((a, b) => a.startTime - b.startTime),
    })),
  updatePhraseCaption: (id, updates) =>
    set((state) => ({
      phraseCaptions: state.phraseCaptions
        .map((c) => (c.id === id ? { ...c, ...updates } : c))
        .sort((a, b) => a.startTime - b.startTime),
    })),
  deletePhraseCaption: (id) =>
    set((state) => {
      const caption = state.phraseCaptions.find((c) => c.id === id);
      const updated = state.phraseCaptions.filter((c) => c.id !== id);
      // Clean orphaned stanzaStyleOverrides if no more captions share this stanzaId
      let overrides = state.stanzaStyleOverrides;
      if (caption?.stanzaId) {
        const stanzaStillUsed = updated.some((c) => c.stanzaId === caption.stanzaId);
        if (!stanzaStillUsed) {
          const { [caption.stanzaId]: _, ...rest } = overrides;
          overrides = rest;
        }
      }
      return { phraseCaptions: updated, stanzaStyleOverrides: overrides };
    }),
  setMusicConfig: (config) =>
    set((state) => ({
      musicConfig: { ...state.musicConfig, ...config },
    })),
  setSelectedMusicTrack: (trackId) => set({ selectedMusicTrack: trackId }),
  setSegments: (segments) => set({ segments }),
  deleteSegment: (id) =>
    set((state) => {
      const segIdSuffix = `_${id}`;
      return {
        segments: state.segments.filter((s) => s.id !== id),
        // Also remove associated effects and B-roll
        effects: state.effects.filter((e) => !e.id.includes(segIdSuffix)),
        bRollImages: state.bRollImages.filter((b) => !b.id.includes(segIdSuffix)),
      };
    }),
  updateSegment: (id, updates) =>
    set((state) => {
      const oldSeg = state.segments.find((s) => s.id === id);
      const updatedSegments = state.segments.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );

      // CASCADE: When a segment's time range changes, proportionally rescale
      // all effects and B-roll items that were generated for this segment.
      // Preset-generated items have IDs like "preset_*_${segmentId}".
      if (oldSeg && ('startTime' in updates || 'endTime' in updates)) {
        const newStart = updates.startTime ?? oldSeg.startTime;
        const newEnd = updates.endTime ?? oldSeg.endTime;
        const oldStart = oldSeg.startTime;
        const oldEnd = oldSeg.endTime;
        const oldDuration = oldEnd - oldStart;
        const newDuration = newEnd - newStart;

        // Cascade if time range changed and old segment had nonzero duration
        if (oldDuration > 0 && (oldStart !== newStart || oldEnd !== newEnd)) {
          // Proportional rescale: map [oldStart, oldEnd] → [newStart, newEnd]
          const rescale = (t: number) => {
            const progress = (t - oldStart) / oldDuration;
            return newStart + progress * newDuration;
          };

          const segIdSuffix = `_${id}`;
          const updatedEffects = state.effects.map((e) => {
            if (!e.id.includes(segIdSuffix)) return e;
            return {
              ...e,
              startTime: Math.max(0, rescale(e.startTime)),
              endTime: Math.min(state.videoDuration || 9999, rescale(e.endTime)),
            };
          });

          const updatedBRoll = state.bRollImages.map((b) => {
            if (!b.id.includes(segIdSuffix)) return b;
            return {
              ...b,
              startTime: Math.max(0, rescale(b.startTime)),
              endTime: Math.min(state.videoDuration || 9999, rescale(b.endTime)),
            };
          });

          return { segments: updatedSegments, effects: updatedEffects, bRollImages: updatedBRoll };
        }
      }

      return { segments: updatedSegments };
    }),
  setEditPlan: (plan) => set({ editPlan: plan }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setSelectedItem: (item) => set({ selectedItem: item, selectedItems: item ? [item] : [] }),
  toggleSelectedItem: (item) =>
    set((state) => {
      const exists = state.selectedItems.some((i) => i.id === item.id && i.type === item.type);
      if (exists) {
        const filtered = state.selectedItems.filter((i) => !(i.id === item.id && i.type === item.type));
        return {
          selectedItems: filtered,
          selectedItem: filtered.length > 0 ? filtered[filtered.length - 1] : null,
        };
      }
      const newItems = [...state.selectedItems, item];
      return { selectedItems: newItems, selectedItem: item };
    }),
  setTeleprompterSettings: (settings) =>
    set((state) => ({
      teleprompterSettings: { ...state.teleprompterSettings, ...settings },
    })),
  setBrandingConfig: (config) =>
    set((state) => ({
      brandingConfig: { ...state.brandingConfig, ...config },
    })),
  setSFXConfig: (config) =>
    set((state) => ({
      sfxConfig: { ...state.sfxConfig, ...config },
    })),
  setSFXMarkers: (markers) => set({ sfxMarkers: markers }),
  addSFXMarker: (marker) =>
    set((state) => ({
      sfxMarkers: [...state.sfxMarkers, marker].sort((a, b) => a.time - b.time),
    })),
  updateSFXMarker: (id, updates) =>
    set((state) => ({
      sfxMarkers: state.sfxMarkers
        .map((m) => (m.id === id ? { ...m, ...updates } : m))
        .sort((a, b) => a.time - b.time),
    })),
  deleteSFXMarker: (id) =>
    set((state) => ({
      sfxMarkers: state.sfxMarkers.filter((m) => m.id !== id),
    })),
  deleteModeSegment: (id) =>
    set((state) => {
      const idx = state.modeSegments.findIndex((s) => s.id === id);
      if (idx === -1) return {};
      const seg = state.modeSegments[idx];
      if (seg.mode !== "broll" && seg.mode !== "typography") return {};

      const segments = [...state.modeSegments];
      const prev = idx > 0 ? segments[idx - 1] : null;
      const next = idx < segments.length - 1 ? segments[idx + 1] : null;

      if (prev?.mode === "presenter" && next?.mode === "presenter") {
        // Merge: expand prev to cover seg + next, remove seg and next
        segments[idx - 1] = { ...prev, endTime: next.endTime };
        segments.splice(idx, 2);
      } else if (prev?.mode === "presenter") {
        // Expand prev to cover seg
        segments[idx - 1] = { ...prev, endTime: seg.endTime };
        segments.splice(idx, 1);
      } else if (next?.mode === "presenter") {
        // Expand next to cover seg
        segments[idx + 1] = { ...next, startTime: seg.startTime };
        segments.splice(idx, 1);
      } else {
        // Replace with new presenter segment
        segments[idx] = {
          id: uuidv4(),
          mode: "presenter",
          startTime: seg.startTime,
          endTime: seg.endTime,
        };
      }

      // Remove SFX markers within the deleted segment range (inclusive)
      const cleanedMarkers = state.sfxMarkers.filter(
        (m) => m.time < seg.startTime || m.time >= seg.endTime
      );

      // Only clear selectedItem if it was the deleted segment
      const selectedItem = (state.selectedItem?.type === "segment" && state.selectedItem.id === id)
        ? null
        : state.selectedItem;

      return { modeSegments: segments, selectedItem, sfxMarkers: cleanedMarkers };
    }),

  applyStyleOverrideToAll: (override) =>
    set((state) => ({
      phraseCaptions: state.phraseCaptions.map((c) => ({
        ...c,
        styleOverride: { ...c.styleOverride, ...override },
      })),
    })),

  splitSegmentForBroll: (id, atTime) =>
    set((state) => {
      const idx = state.modeSegments.findIndex((s) => s.id === id);
      if (idx === -1) return {};
      const seg = state.modeSegments[idx];
      if (seg.mode !== "presenter") return {};

      const brollDuration = 4;
      const brollEnd = Math.min(atTime + brollDuration, seg.endTime);
      const segments = [...state.modeSegments];
      const newSegments: ModeSegment[] = [];

      // Part 1: presenter before b-roll (if ≥ 0.3s)
      if (atTime - seg.startTime >= 0.3) {
        newSegments.push({
          id: seg.id, // keep original id
          mode: "presenter",
          startTime: seg.startTime,
          endTime: atTime,
        });
      }

      // Part 2: b-roll
      newSegments.push({
        id: uuidv4(),
        mode: "broll",
        startTime: newSegments.length > 0 ? atTime : seg.startTime,
        endTime: brollEnd,
        brollEffect: "ken-burns",
        brollLayout: "fullscreen",
      });

      // Part 3: presenter after b-roll (if ≥ 0.3s)
      if (seg.endTime - brollEnd >= 0.3) {
        newSegments.push({
          id: uuidv4(),
          mode: "presenter",
          startTime: brollEnd,
          endTime: seg.endTime,
        });
      }

      segments.splice(idx, 1, ...newSegments);
      return { modeSegments: segments };
    }),

  batchOffsetItems: (items, deltaTime) =>
    set((state) => {
      const dur = state.videoDuration || 9999;
      const captionIds = new Set(items.filter((i) => i.type === "caption").map((i) => i.id));
      const effectIds = new Set(items.filter((i) => i.type === "effect").map((i) => i.id));
      const brollIds = new Set(items.filter((i) => i.type === "broll").map((i) => i.id));
      const segmentIds = new Set(items.filter((i) => i.type === "segment").map((i) => i.id));

      const clamp = (s: number, e: number) => ({
        startTime: Math.max(0, Math.min(s, dur)),
        endTime: Math.max(0, Math.min(e, dur)),
      });

      const updatedCaptions = captionIds.size > 0
        ? state.captions.map((c) => {
            if (!captionIds.has(c.id)) return c;
            const { startTime, endTime } = clamp(c.startTime + deltaTime, c.endTime + deltaTime);
            const wordTimings = c.wordTimings?.map((wt) => ({
              start: Math.max(0, wt.start + deltaTime),
              end: Math.max(0.02, wt.end + deltaTime),
            }));
            return { ...c, startTime, endTime, wordTimings };
          }).sort((a, b) => a.startTime - b.startTime)
        : state.captions;

      const updatedEffects = effectIds.size > 0
        ? state.effects.map((e) => {
            if (!effectIds.has(e.id)) return e;
            const { startTime, endTime } = clamp(e.startTime + deltaTime, e.endTime + deltaTime);
            return { ...e, startTime, endTime };
          })
        : state.effects;

      const updatedBRoll = brollIds.size > 0
        ? state.bRollImages.map((b) => {
            if (!brollIds.has(b.id)) return b;
            const { startTime, endTime } = clamp(b.startTime + deltaTime, b.endTime + deltaTime);
            return { ...b, startTime, endTime };
          })
        : state.bRollImages;

      const updatedSegments = segmentIds.size > 0
        ? state.segments.map((s) => {
            if (!segmentIds.has(s.id)) return s;
            const { startTime, endTime } = clamp(s.startTime + deltaTime, s.endTime + deltaTime);
            return { ...s, startTime, endTime };
          })
        : state.segments;

      return {
        captions: updatedCaptions,
        effects: updatedEffects,
        bRollImages: updatedBRoll,
        segments: updatedSegments,
      };
    }),
  reset: () => set(initialState),
    }),
    {
      name: "instavideo-project",
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { videoFile, status, statusMessage, currentTime, isPlaying, selectedItem, selectedItems, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isValid = !!(state.videoUrl && state.videoDuration > 0);
          state.status = isValid ? "ready" : "idle";
        }
      },
    }
  )
);
