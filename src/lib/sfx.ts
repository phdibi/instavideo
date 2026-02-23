/**
 * CineAI SFX Engine — Cinematic sound effects using Web Audio API.
 *
 * Generates procedural sounds for element transitions, inspired by
 * the Captions app which uses "clicks", "whooshes", and other
 * cinematic sounds to introduce elements.
 *
 * Available effects:
 * - whoosh: Filtered noise sweep — for B-Roll transitions
 * - swoosh-in: Ascending tone — element sliding in
 * - swoosh-out: Descending tone — element sliding out
 * - pop: Short sine burst — caption group change
 * - click: Very short impulse — subtle accent
 * - rise: Ascending dual tone — keyword/hook reveal
 * - impact: Deep thud + noise — hook start punch
 *
 * No external audio files needed — everything is synthesized in real-time.
 * Sounds are designed to be subtle and cinematic, never distracting.
 */

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

/**
 * Play a cinematic sound effect.
 * @param type - The type of sound to play
 * @param volume - Volume from 0-1 (default: 0.15 — subtle, non-intrusive)
 */
export function playSFX(type: SFXType, volume: number = 0.15): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    switch (type) {
      case "whoosh":
        playWhoosh(ctx, now, volume);
        break;
      case "swoosh-in":
        playSwooshIn(ctx, now, volume);
        break;
      case "swoosh-out":
        playSwooshOut(ctx, now, volume);
        break;
      case "pop":
        playPop(ctx, now, volume);
        break;
      case "click":
        playClick(ctx, now, volume);
        break;
      case "rise":
        playRise(ctx, now, volume);
        break;
      case "impact":
        playImpact(ctx, now, volume);
        break;
    }
  } catch {
    // Silently fail — SFX are non-essential enhancements
  }
}

// ── Whoosh — filtered white noise with frequency sweep ──
// Used for B-Roll transitions, segment changes
function playWhoosh(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.3;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    const envelope = Math.sin(t * Math.PI) * Math.exp(-t * 2);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(2500, now + duration * 0.4);
  filter.frequency.exponentialRampToValueAtTime(400, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration);
}

// ── Swoosh In — ascending frequency sweep ──
// Used when elements slide into view
function playSwooshIn(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.2;

  // Filtered noise component
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.5;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(2000, now + duration);

  // Sine tone component
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  osc.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  osc.start(now);
  noise.stop(now + duration);
  osc.stop(now + duration);
}

// ── Swoosh Out — descending frequency sweep ──
// Used when elements slide out of view
function playSwooshOut(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.2;

  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.5;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + duration);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  osc.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  osc.start(now);
  noise.stop(now + duration);
  osc.stop(now + duration);
}

// ── Pop — short sine burst ──
// Used for caption group transitions, subtle accent
function playPop(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.08;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(500, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ── Click — very short impulse ──
// Used for subtle transition accents
function playClick(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.025;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ── Rise — ascending dual tone for keyword reveal ──
// Used when the hook keyword appears with a cinematic reveal
function playRise(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.35;

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(200, now);
  osc1.frequency.exponentialRampToValueAtTime(1000, now + duration * 0.7);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(300, now);
  osc2.frequency.exponentialRampToValueAtTime(1500, now + duration * 0.7);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume * 0.2, now + duration * 0.3);
  gain.gain.linearRampToValueAtTime(volume * 0.12, now + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
}

// ── Impact — deep thud + noise burst ──
// Used at the very start of the hook for a cinematic punch
function playImpact(ctx: AudioContext, now: number, volume: number) {
  const duration = 0.25;

  // Low sine thud
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(70, now);
  osc.frequency.exponentialRampToValueAtTime(25, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(volume * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Short noise burst
  const noiseLen = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / noiseLen) * 6);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  osc.start(now);
  noise.start(now);
  osc.stop(now + duration);
  noise.stop(now + 0.08);
}

/**
 * Cleanup — close the AudioContext when no longer needed.
 */
export function disposeSFX(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}
