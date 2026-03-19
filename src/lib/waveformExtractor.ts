/**
 * Extract waveform peaks from a video/audio URL for timeline visualization.
 * Uses AudioContext to decode audio and compute peak amplitudes per bin.
 */
export async function extractWaveform(
  videoUrl: string,
  numBins: number
): Promise<Float32Array> {
  const response = await fetch(videoUrl);
  const arrayBuffer = await response.arrayBuffer();

  // Use a regular AudioContext for decoding (works for both blob: and http: URLs)
  const audioCtx = new AudioContext();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBin = Math.max(1, Math.floor(channelData.length / numBins));
    const peaks = new Float32Array(numBins);

    for (let i = 0; i < numBins; i++) {
      let max = 0;
      const start = i * samplesPerBin;
      const end = Math.min(start + samplesPerBin, channelData.length);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }

    return peaks;
  } finally {
    await audioCtx.close();
  }
}
