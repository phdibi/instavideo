import type { VoiceEnhancePreset, VoiceEnhanceConfig } from "@/types";

interface PresetParams {
  highpassFreq: number;
  lowShelfGain: number;
  presenceGain: number;
  deEssGain: number;
  compressorThreshold: number;
  compressorRatio: number;
}

export const VOICE_PRESETS: Record<Exclude<VoiceEnhancePreset, "off">, PresetParams> = {
  natural: {
    highpassFreq: 80,
    lowShelfGain: 2,
    presenceGain: 2,
    deEssGain: -2,
    compressorThreshold: -18,
    compressorRatio: 3,
  },
  podcast: {
    highpassFreq: 100,
    lowShelfGain: 4,
    presenceGain: 5,
    deEssGain: -4,
    compressorThreshold: -24,
    compressorRatio: 4,
  },
  cinematic: {
    highpassFreq: 60,
    lowShelfGain: 5,
    presenceGain: 3,
    deEssGain: -3,
    compressorThreshold: -20,
    compressorRatio: 3.5,
  },
};

export interface VoiceEnhancerChain {
  input: AudioNode;
  output: AudioNode;
  update: (config: VoiceEnhanceConfig) => void;
  disconnect: () => void;
}

export function createVoiceEnhancerChain(
  ctx: AudioContext | OfflineAudioContext,
  config: VoiceEnhanceConfig
): VoiceEnhancerChain {
  // Highpass — remove rumble
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 80;
  highpass.Q.value = 0.7;

  // Low shelf @ 250Hz — body
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 250;
  lowShelf.gain.value = 0;

  // Presence @ 3kHz — clarity
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3000;
  presence.Q.value = 1.0;
  presence.gain.value = 0;

  // De-ess @ 7kHz — reduce sibilance
  const deEss = ctx.createBiquadFilter();
  deEss.type = "highshelf";
  deEss.frequency.value = 7000;
  deEss.gain.value = 0;

  // Compressor — level volume
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  compressor.knee.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  // Chain: highpass → lowShelf → presence → deEss → compressor
  highpass.connect(lowShelf);
  lowShelf.connect(presence);
  presence.connect(deEss);
  deEss.connect(compressor);

  function applyConfig(cfg: VoiceEnhanceConfig) {
    if (cfg.preset === "off") {
      // Zero out all EQ gains, neutral compressor
      lowShelf.gain.value = 0;
      presence.gain.value = 0;
      deEss.gain.value = 0;
      highpass.frequency.value = 20;
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;
      return;
    }

    const p = VOICE_PRESETS[cfg.preset];
    const i = cfg.intensity;

    highpass.frequency.value = p.highpassFreq;
    lowShelf.gain.value = p.lowShelfGain * i;
    presence.gain.value = p.presenceGain * i;
    deEss.gain.value = p.deEssGain * i;
    compressor.threshold.value = p.compressorThreshold * i;
    compressor.ratio.value = 1 + (p.compressorRatio - 1) * i;
  }

  applyConfig(config);

  return {
    input: highpass,
    output: compressor,
    update: applyConfig,
    disconnect: () => {
      highpass.disconnect();
      lowShelf.disconnect();
      presence.disconnect();
      deEss.disconnect();
      compressor.disconnect();
    },
  };
}
