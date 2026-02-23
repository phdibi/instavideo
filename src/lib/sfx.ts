/**
 * CineAI SFX Engine — Professional cinematic sound effects via Web Audio API.
 *
 * Redesigned for a serious, corporate/professional tone. Sounds are:
 * - Deep, low-frequency based (not bright/childish)
 * - Short and subtle (never overpowering the content)
 * - Inspired by broadcast TV and corporate video production
 *
 * Supports SFX profiles:
 * - "corporate": Clean, subtle — like a Bloomberg/CNBC transition
 * - "minimal": Ultra-subtle — barely-there accents
 * - "cinematic": Film-style — deeper, more dramatic
 * - "none": All sounds disabled
 *
 * All sounds are procedurally generated — no external audio files.
 */

import type { SFXProfile } from "@/types";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export type SFXType =
  | "whoosh"
  | "swoosh-in"
  | "swoosh-out"
  | "pop"
  | "click"
  | "rise"
  | "impact";

// Profile volume multipliers — shape the intensity per profile
const PROFILE_MULTIPLIER: Record<SFXProfile, number> = {
  corporate: 1.0,
  minimal: 0.5,
  cinematic: 1.4,
  none: 0,
};

// Profile frequency shift — corporate = neutral, cinematic = deeper
const PROFILE_FREQ_SHIFT: Record<SFXProfile, number> = {
  corporate: 1.0,
  minimal: 1.1,  // slightly higher = thinner = more subtle
  cinematic: 0.7, // lower frequencies = more dramatic
  none: 1.0,
};

/**
 * Play a professional sound effect.
 * @param type - The type of sound to play
 * @param volume - Base volume 0-1 (will be modified by profile)
 * @param profile - SFX profile to use (default: "corporate")
 */
export function playSFX(
  type: SFXType,
  volume: number = 0.12,
  profile: SFXProfile = "corporate"
): void {
  if (profile === "none") return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const vol = volume * PROFILE_MULTIPLIER[profile];
    const freqShift = PROFILE_FREQ_SHIFT[profile];

    switch (type) {
      case "whoosh":
        playWhoosh(ctx, now, vol, freqShift);
        break;
      case "swoosh-in":
        playSwooshIn(ctx, now, vol, freqShift);
        break;
      case "swoosh-out":
        playSwooshOut(ctx, now, vol, freqShift);
        break;
      case "pop":
        playPop(ctx, now, vol, freqShift);
        break;
      case "click":
        playClick(ctx, now, vol, freqShift);
        break;
      case "rise":
        playRise(ctx, now, vol, freqShift);
        break;
      case "impact":
        playImpact(ctx, now, vol, freqShift);
        break;
    }
  } catch {
    // Silently fail — SFX are non-essential
  }
}

/**
 * Preview a specific SFX for the settings panel.
 */
export function previewSFX(type: SFXType, volume: number, profile: SFXProfile): void {
  playSFX(type, volume, profile);
}

// ── Whoosh — deep filtered noise sweep ──
// Corporate: clean air movement. Cinematic: deeper rumble.
function playWhoosh(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.25;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    // Asymmetric envelope — fast attack, slow release (professional feel)
    const envelope = Math.pow(Math.sin(t * Math.PI), 0.5) * Math.exp(-t * 3);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Low-frequency focused bandpass — deep, serious
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(150 * freq, now);
  filter.frequency.exponentialRampToValueAtTime(800 * freq, now + duration * 0.3);
  filter.frequency.exponentialRampToValueAtTime(200 * freq, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration);
}

// ── Swoosh In — low rumble sweep ──
// Professional air movement for element entrance
function playSwooshIn(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.18;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.pow(t, 0.3) * Math.exp(-t * 2) * 0.6;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(200 * freq, now);
  filter.frequency.exponentialRampToValueAtTime(1200 * freq, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(vol * 0.3, now + duration * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

// ── Swoosh Out — descending low rumble ──
function playSwooshOut(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.18;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * Math.exp(-t) * 0.6;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(1200 * freq, now);
  filter.frequency.exponentialRampToValueAtTime(150 * freq, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

// ── Pop — deep, short thump ──
// Like a professional camera shutter or light switch
function playPop(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.06;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200 * freq, now);
  osc.frequency.exponentialRampToValueAtTime(60 * freq, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ── Click — crisp, short impulsion ──
// Like a professional broadcast transition marker
function playClick(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.02;

  // Very short noise burst — like a relay click
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 15);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 400 * freq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration);
}

// ── Rise — deep ascending tone ──
// Professional reveal sound — like a corporate logo stinger
function playRise(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.3;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80 * freq, now);
  osc.frequency.exponentialRampToValueAtTime(400 * freq, now + duration * 0.8);

  // Subtle harmonic layer
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(120 * freq, now);
  osc2.frequency.exponentialRampToValueAtTime(600 * freq, now + duration * 0.8);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(vol * 0.15, now + duration * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + duration);
  osc2.stop(now + duration);
}

// ── Impact — deep sub-bass hit ──
// Like a cinematic title card reveal — felt more than heard
function playImpact(ctx: AudioContext, now: number, vol: number, freq: number) {
  const duration = 0.2;

  // Deep sub-bass oscillator
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(50 * freq, now);
  osc.frequency.exponentialRampToValueAtTime(20 * freq, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Tight noise transient (like a muted kick drum)
  const noiseLen = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / noiseLen) * 10);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 300 * freq;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.2, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  osc.start(now);
  noise.start(now);
  osc.stop(now + duration);
  noise.stop(now + 0.04);
}

/**
 * Cleanup AudioContext when no longer needed.
 */
export function disposeSFX(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}
