/**
 * Cinematic SFX Engine — Web Audio API synthesized sounds.
 * Plays short cinematic transition sounds on mode changes.
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

/**
 * Whoosh — swoosh sound for b-roll enter/exit transitions.
 * Uses filtered noise with a frequency sweep.
 */
export function playWhoosh(volume = 0.12) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.25;

    // White noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Band-pass filter sweeping from high to low
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(4000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);

    // Envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.03);
    gain.gain.linearRampToValueAtTime(volume * 0.6, now + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  } catch { /* silently ignore audio errors */ }
}

/**
 * Reverse whoosh — for element exit.
 * Low → high frequency sweep.
 */
export function playWhooshOut(volume = 0.08) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.2;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(volume * 0.3, now + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  } catch { /* silently ignore audio errors */ }
}

/**
 * Impact — deep bass hit for typography card entry.
 * Low sine burst + noise transient.
 */
export function playImpact(volume = 0.15) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Sub bass hit
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(volume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    // Transient click
    const clickBuf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickData.length; i++) {
      clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.003));
    }

    const click = ctx.createBufferSource();
    click.buffer = clickBuf;
    const clickGain = ctx.createGain();
    clickGain.gain.value = volume * 0.6;
    click.connect(clickGain);
    clickGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
    click.start(now);
    click.stop(now + 0.02);
  } catch { /* silently ignore audio errors */ }
}

/**
 * Rise — subtle ascending tone for dramatic build-up.
 * Two detuned oscillators rising in pitch.
 */
export function playRise(volume = 0.06) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.35;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    gain.connect(ctx.destination);

    // Two detuned oscillators for richness
    for (const detune of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + duration);
      osc.detune.value = detune;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2000;

      osc.connect(filter);
      filter.connect(gain);

      osc.start(now);
      osc.stop(now + duration);
    }
  } catch { /* silently ignore audio errors */ }
}

/**
 * Transition SFX manager — detects mode changes and plays appropriate sounds.
 */
export type VideoMode = "presenter" | "broll" | "typography";

let lastMode: VideoMode | null = null;

export function triggerTransitionSFX(currentMode: VideoMode, masterVolume = 0.15) {
  if (lastMode === null) {
    lastMode = currentMode;
    return;
  }

  if (currentMode === lastMode) return;

  const prevMode = lastMode;
  lastMode = currentMode;

  // B-roll entering
  if (currentMode === "broll") {
    playWhoosh(masterVolume);
  }
  // B-roll exiting
  else if (prevMode === "broll") {
    playWhooshOut(masterVolume * 0.7);
  }
  // Typography entering
  if (currentMode === "typography") {
    playImpact(masterVolume);
  }
  // Typography exiting
  else if (prevMode === "typography") {
    playRise(masterVolume * 0.5);
  }
}

/** Reset mode tracker (e.g. when seeking) */
export function resetSFXTracker() {
  lastMode = null;
}

/**
 * Generate SFX audio buffer for export — renders all transition sounds
 * into an AudioBuffer that can be mixed into the final export.
 */
export async function renderSFXToBuffer(
  ctx: OfflineAudioContext,
  modeSegments: { mode: VideoMode; startTime: number; endTime: number }[],
  masterVolume = 0.15
): Promise<void> {
  const sorted = [...modeSegments].sort((a, b) => a.startTime - b.startTime);
  const dest = ctx.destination;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const time = curr.startTime;

    if (curr.mode === prev.mode) continue;

    // B-roll entering — whoosh
    if (curr.mode === "broll") {
      const duration = 0.25;
      const bufSize = ctx.sampleRate * duration;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < bufSize; j++) {
        data[j] = (Math.random() * 2 - 1) * 0.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 2;
      filter.frequency.setValueAtTime(4000, time);
      filter.frequency.exponentialRampToValueAtTime(200, time + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(masterVolume, time + 0.03);
      gain.gain.linearRampToValueAtTime(masterVolume * 0.6, time + duration * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      noise.start(time);
      noise.stop(time + duration);
    }

    // B-roll exiting — reverse whoosh
    if (prev.mode === "broll" && curr.mode !== "broll") {
      const duration = 0.2;
      const bufSize = ctx.sampleRate * duration;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < bufSize; j++) {
        data[j] = (Math.random() * 2 - 1) * 0.4;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 2;
      filter.frequency.setValueAtTime(300, time);
      filter.frequency.exponentialRampToValueAtTime(3000, time + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(masterVolume * 0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      noise.start(time);
      noise.stop(time + duration);
    }

    // Typography entering — impact
    if (curr.mode === "typography") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(80, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(masterVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.25);
    }
  }
}
