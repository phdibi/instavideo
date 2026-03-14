/**
 * Cinematic SFX Engine — Web Audio API synthesized sounds.
 * Rich onomatopoeia-style movement sounds for transitions.
 *
 * Sounds:
 * - Whoosh In:  "FWSSHHH" — layered noise sweep + tonal body for b-roll entry
 * - Whoosh Out: "SHWWFFF" — reverse sweep for b-roll exit
 * - Impact:     "BWOMM"   — deep bass hit + transient for typography
 * - Rise:       "WEEEOOO" — ascending dual-tone for typography exit
 * - Slide:      "SHHK"    — quick slide sound for split-screen transitions
 * - Pop:        "TPOK"    — subtle pop for element appearance
 */

import type { VideoMode, BRollLayout } from "@/types";

// ── Audio Context Singleton ───────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Create a noise buffer of given duration */
function makeNoise(ctx: BaseAudioContext, duration: number, amplitude = 1): AudioBuffer {
  const size = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    data[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return buf;
}

// ── Playback sounds (preview) ─────────────────────────────────────────

/**
 * "FWSSHHH" — Cinematic whoosh-in.
 * 3-layer: broadband noise sweep + mid-tone body + high shimmer.
 */
export function playWhoosh(volume = 0.12) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const dur = 0.3;

    // Layer 1: Broadband noise with sweeping bandpass (body of the whoosh)
    const noise1 = ctx.createBufferSource();
    noise1.buffer = makeNoise(ctx, dur, 0.6);
    const bp1 = ctx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.Q.value = 1.5;
    bp1.frequency.setValueAtTime(5000, t);
    bp1.frequency.exponentialRampToValueAtTime(150, t + dur);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(volume, t + 0.02);
    g1.gain.setValueAtTime(volume, t + 0.05);
    g1.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise1.connect(bp1).connect(g1).connect(ctx.destination);
    noise1.start(t);
    noise1.stop(t + dur);

    // Layer 2: Tonal body (low sine swooping down)
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + dur * 0.8);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(volume * 0.3, t + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    osc.connect(g2).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);

    // Layer 3: High shimmer (filtered noise, brief)
    const noise2 = ctx.createBufferSource();
    noise2.buffer = makeNoise(ctx, 0.08, 0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(volume * 0.15, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise2.connect(hp).connect(g3).connect(ctx.destination);
    noise2.start(t);
    noise2.stop(t + 0.08);
  } catch { /* ignore */ }
}

/**
 * "SHWWFFF" — Reverse whoosh for exit.
 * Rising frequency sweep with airy tail.
 */
export function playWhooshOut(volume = 0.09) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const dur = 0.22;

    // Rising noise sweep
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoise(ctx, dur, 0.5);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume * 0.5, t);
    g.gain.linearRampToValueAtTime(volume, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(bp).connect(g).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);

    // Tonal rise
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + dur * 0.8);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(volume * 0.2, t + dur * 0.3);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g2).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch { /* ignore */ }
}

/**
 * "BWOMM" — Deep cinematic impact.
 * Sub bass + mid transient + noise crack.
 */
export function playImpact(volume = 0.15) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Sub bass — deep "BWOM"
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    const gSub = ctx.createGain();
    gSub.gain.setValueAtTime(volume * 1.2, t);
    gSub.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    sub.connect(gSub).connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 0.35);

    // Mid transient — "click" body
    const mid = ctx.createOscillator();
    mid.type = "triangle";
    mid.frequency.setValueAtTime(200, t);
    mid.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    const gMid = ctx.createGain();
    gMid.gain.setValueAtTime(volume * 0.8, t);
    gMid.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    mid.connect(gMid).connect(ctx.destination);
    mid.start(t);
    mid.stop(t + 0.1);

    // Noise crack — initial transient
    const crack = ctx.createBufferSource();
    crack.buffer = makeNoise(ctx, 0.015, 1);
    const gCrack = ctx.createGain();
    gCrack.gain.setValueAtTime(volume * 0.5, t);
    gCrack.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    crack.connect(gCrack).connect(ctx.destination);
    crack.start(t);
    crack.stop(t + 0.015);
  } catch { /* ignore */ }
}

/**
 * "WEEEOOO" — Rising tension tone.
 * Dual detuned oscillators ascending with harmonic shimmer.
 */
export function playRise(volume = 0.07) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const dur = 0.4;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(volume, t + dur * 0.6);
    master.gain.exponentialRampToValueAtTime(0.001, t + dur);
    master.connect(ctx.destination);

    // Dual detuned sines
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + dur);
      osc.detune.value = detune;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2500;
      osc.connect(lp).connect(master);
      osc.start(t);
      osc.stop(t + dur);
    }

    // Harmonic shimmer (octave above, quiet)
    const shim = ctx.createOscillator();
    shim.type = "sine";
    shim.frequency.setValueAtTime(360, t);
    shim.frequency.exponentialRampToValueAtTime(1800, t + dur);
    const gShim = ctx.createGain();
    gShim.gain.setValueAtTime(0, t);
    gShim.gain.linearRampToValueAtTime(volume * 0.15, t + dur * 0.5);
    gShim.gain.exponentialRampToValueAtTime(0.001, t + dur);
    shim.connect(gShim).connect(ctx.destination);
    shim.start(t);
    shim.stop(t + dur);
  } catch { /* ignore */ }
}

/**
 * "SHHK" — Quick slide/swipe sound.
 * Very short filtered noise burst for split transitions.
 */
export function playSlide(volume = 0.08) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const dur = 0.12;

    const noise = ctx.createBufferSource();
    noise.buffer = makeNoise(ctx, dur, 0.7);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(3000, t);
    bp.frequency.exponentialRampToValueAtTime(800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(bp).connect(g).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  } catch { /* ignore */ }
}

/**
 * "TPOK" — Subtle pop for elements appearing.
 * Very short sine burst with noise top.
 */
export function playPop(volume = 0.06) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  } catch { /* ignore */ }
}

// ── Transition Manager (preview) ──────────────────────────────────────

let lastMode: VideoMode | null = null;

export function triggerTransitionSFX(
  currentMode: VideoMode,
  masterVolume = 0.15,
  layout?: BRollLayout
) {
  if (lastMode === null) {
    lastMode = currentMode;
    return;
  }

  if (currentMode === lastMode) return;

  const prev = lastMode;
  lastMode = currentMode;

  // Entering b-roll
  if (currentMode === "broll") {
    if (layout === "split") {
      playSlide(masterVolume);
    } else {
      playWhoosh(masterVolume);
    }
    return;
  }

  // Entering typography
  if (currentMode === "typography") {
    playImpact(masterVolume);
    return;
  }

  // Returning to presenter from b-roll
  if (prev === "broll") {
    playWhooshOut(masterVolume * 0.7);
    return;
  }

  // Returning to presenter from typography
  if (prev === "typography") {
    playRise(masterVolume * 0.5);
    return;
  }
}

export function resetSFXTracker() {
  lastMode = null;
}

// ── Export Rendering ──────────────────────────────────────────────────
// Renders all transition SFX into an OfflineAudioContext for export.

interface ExportSegment {
  mode: VideoMode;
  startTime: number;
  endTime: number;
  brollLayout?: BRollLayout;
}

/** Schedule a filtered noise burst on an OfflineAudioContext */
function scheduleNoise(
  ctx: OfflineAudioContext,
  time: number,
  duration: number,
  amplitude: number,
  volume: number,
  freqStart: number,
  freqEnd: number,
  q = 2
) {
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoise(ctx, duration, amplitude);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(freqStart, time);
  bp.frequency.exponentialRampToValueAtTime(freqEnd, time + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(volume, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  noise.connect(bp).connect(g).connect(ctx.destination);
  noise.start(time);
  noise.stop(time + duration);
}

/** Schedule a tonal sweep on an OfflineAudioContext */
function scheduleTone(
  ctx: OfflineAudioContext,
  time: number,
  duration: number,
  volume: number,
  freqStart: number,
  freqEnd: number,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, time);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, time + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(volume, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}

export async function renderSFXToBuffer(
  ctx: OfflineAudioContext,
  modeSegments: ExportSegment[],
  masterVolume = 0.15
): Promise<void> {
  const sorted = [...modeSegments].sort((a, b) => a.startTime - b.startTime);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const t = curr.startTime;

    if (curr.mode === prev.mode) continue;

    // Entering b-roll
    if (curr.mode === "broll") {
      if (curr.brollLayout === "split") {
        // Slide: short filtered noise
        scheduleNoise(ctx, t, 0.12, 0.7, masterVolume, 3000, 800, 3);
      } else {
        // Whoosh in: noise sweep + tonal body
        scheduleNoise(ctx, t, 0.3, 0.6, masterVolume, 5000, 150, 1.5);
        scheduleTone(ctx, t, 0.2, masterVolume * 0.3, 400, 80);
      }
      continue;
    }

    // Entering typography
    if (curr.mode === "typography") {
      // Impact: sub bass + mid transient
      scheduleTone(ctx, t, 0.3, masterVolume * 1.2, 90, 35);
      scheduleTone(ctx, t, 0.08, masterVolume * 0.8, 200, 60, "triangle");
      scheduleNoise(ctx, t, 0.015, 1, masterVolume * 0.5, 2000, 1000, 1);
      continue;
    }

    // Exiting b-roll
    if (prev.mode === "broll") {
      // Reverse whoosh
      scheduleNoise(ctx, t, 0.22, 0.5, masterVolume * 0.7, 200, 4000, 1.8);
      scheduleTone(ctx, t, 0.18, masterVolume * 0.15, 100, 600);
      continue;
    }

    // Exiting typography
    if (prev.mode === "typography") {
      // Rise
      scheduleTone(ctx, t, 0.35, masterVolume * 0.4, 180, 900);
      continue;
    }
  }
}
