import { create } from "zustand";
import type {
  Caption,
  EditEffect,
  BRollImage,
  EditPlan,
  ProjectStatus,
  TeleprompterSettings,
  VideoSegment,
  BrandingConfig,
  BackgroundConfig,
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
  selectedItem: { type: "caption" | "effect" | "broll" | "segment"; id: string } | null;
  teleprompterSettings: TeleprompterSettings;
  brandingConfig: BrandingConfig;
  backgroundConfig: BackgroundConfig;

  setSegments: (segments: VideoSegment[]) => void;
  updateSegment: (id: string, updates: Partial<VideoSegment>) => void;
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
  setSelectedItem: (item: { type: "caption" | "effect" | "broll" | "segment"; id: string } | null) => void;
  setTeleprompterSettings: (settings: Partial<TeleprompterSettings>) => void;
  setBrandingConfig: (config: Partial<BrandingConfig>) => void;
  setBackgroundConfig: (config: Partial<BackgroundConfig>) => void;
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

const defaultBackgroundConfig: BackgroundConfig = {
  enabled: false,
  microphoneOverlay: false,
  edgeSmoothing: 0.5,
};

const defaultBrandingConfig: BrandingConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Seu Nome",
  title: process.env.NEXT_PUBLIC_BRAND_TITLE || "Consultor de IA | Psicólogo",
  showWatermark: true,
  showCTA: true,
  ctaTemplate: "siga",
  contentPillar: "ia-tech",
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
  teleprompterSettings: { ...defaultTeleprompterSettings },
  brandingConfig: { ...defaultBrandingConfig },
  backgroundConfig: { ...defaultBackgroundConfig },
};

export const useProjectStore = create<ProjectStore>((set) => ({
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
    set((state) => ({
      effects: state.effects.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    })),
  deleteEffect: (id) =>
    set((state) => ({
      effects: state.effects.filter((e) => e.id !== id),
    })),
  setBRollImages: (images) => set({ bRollImages: images }),
  updateBRollImage: (id, updates) =>
    set((state) => ({
      bRollImages: state.bRollImages.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    })),
  deleteBRollImage: (id) =>
    set((state) => ({
      bRollImages: state.bRollImages.filter((b) => b.id !== id),
    })),
  setSegments: (segments) => set({ segments }),
  updateSegment: (id, updates) =>
    set((state) => ({
      segments: state.segments.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  setEditPlan: (plan) => set({ editPlan: plan }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setTeleprompterSettings: (settings) =>
    set((state) => ({
      teleprompterSettings: { ...state.teleprompterSettings, ...settings },
    })),
  setBrandingConfig: (config) =>
    set((state) => ({
      brandingConfig: { ...state.brandingConfig, ...config },
    })),
  setBackgroundConfig: (config) =>
    set((state) => ({
      backgroundConfig: { ...state.backgroundConfig, ...config },
    })),
  reset: () => set(initialState),
}));
