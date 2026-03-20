/**
 * WebCodecs-based offline video export.
 * Uses VideoEncoder + AudioEncoder + mp4-muxer for high-quality offline encoding.
 * Falls back gracefully when WebCodecs is not available.
 */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// ── Shared audio constants ──
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = 128_000;

// ── Feature detection ──

export function isWebCodecsAvailable(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof AudioData !== "undefined" &&
    typeof EncodedVideoChunk !== "undefined"
  );
}

export interface WebCodecsConfig {
  videoCodec: string;
  videoConfig: VideoEncoderConfig;
  audioCodec: string;
  audioConfig: AudioEncoderConfig;
  container: "mp4";
  muxerVideoCodec: "avc" | "hevc" | "vp9" | "av1";
  muxerAudioCodec: "aac" | "opus";
}

/**
 * Probe browser for WebCodecs support and find the best codec combination.
 * Tries H.264+AAC first, then H.264+Opus as fallback (Opus is software-encoded, always works).
 * Returns null if WebCodecs is not supported.
 */
export async function probeWebCodecs(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<WebCodecsConfig | null> {
  if (!isWebCodecsAvailable()) return null;

  const h264Codecs: { codec: string; muxerCodec: "avc" }[] = [
    { codec: "avc1.640028", muxerCodec: "avc" }, // High Profile Level 4.0
    { codec: "avc1.42001f", muxerCodec: "avc" }, // Baseline Profile Level 3.1
  ];

  // Audio codecs in preference order: AAC (better player compat) → Opus (always works)
  const audioConfigs: { codec: string; muxerCodec: "aac" | "opus"; config: AudioEncoderConfig }[] = [
    {
      codec: "mp4a.40.2",
      muxerCodec: "aac",
      config: { codec: "mp4a.40.2", sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE },
    },
    {
      codec: "opus",
      muxerCodec: "opus",
      config: { codec: "opus", sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE },
    },
  ];

  for (const { codec: videoCodecStr, muxerCodec: muxerVideoCodec } of h264Codecs) {
    for (const { muxerCodec: muxerAudioCodec, config: audioBaseConfig } of audioConfigs) {
      try {
        const videoConfig: VideoEncoderConfig = {
          codec: videoCodecStr,
          width,
          height,
          bitrate,
          framerate: fps,
          latencyMode: "quality",
          bitrateMode: "variable",
        };

        const [videoSupport, audioSupport] = await Promise.all([
          VideoEncoder.isConfigSupported(videoConfig),
          AudioEncoder.isConfigSupported(audioBaseConfig),
        ]);

        if (
          videoSupport.supported &&
          audioSupport.supported &&
          videoSupport.config &&
          audioSupport.config
        ) {
          return {
            videoCodec: videoCodecStr,
            videoConfig: videoSupport.config,
            audioCodec: audioBaseConfig.codec,
            audioConfig: audioSupport.config,
            container: "mp4",
            muxerVideoCodec,
            muxerAudioCodec,
          };
        }
      } catch {
        // Config not supported, try next combo
      }
    }
  }

  return null;
}

/**
 * Helper: seek a video element to a specific time and wait for it to be ready.
 * Includes timeout to prevent hanging forever if seek fails.
 */
export function seekVideo(
  video: HTMLVideoElement,
  time: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Threshold must be less than half a frame at 60fps (8.3ms) to avoid duplicates
    if (Math.abs(video.currentTime - time) < 0.005) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      console.warn(`[seekVideo] Timeout seeking to ${time.toFixed(3)}s — using stale frame`);
      resolve(); // stale frame is better than crashing
    }, 5000);

    const onSeeked = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };

    const onError = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error(`Video seek failed at time ${time}`));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

export interface MuxerBundle {
  muxer: Muxer<ArrayBufferTarget>;
  videoEncoder: VideoEncoder;
  audioEncoder: AudioEncoder;
  target: ArrayBufferTarget;
  encoderError: Error | null;
  audioChunkCount: number;
}

/**
 * Create the muxer + encoders bundle.
 * Encoder errors are captured in bundle.encoderError.
 * Audio chunk count is tracked in bundle.audioChunkCount.
 */
export function createMuxerBundle(
  config: WebCodecsConfig,
  width: number,
  height: number,
  fps: number
): MuxerBundle {
  const target = new ArrayBufferTarget();
  const bundle: MuxerBundle = {
    muxer: null!,
    videoEncoder: null!,
    audioEncoder: null!,
    target,
    encoderError: null,
    audioChunkCount: 0,
  };

  bundle.muxer = new Muxer({
    target,
    video: {
      codec: config.muxerVideoCodec,
      width,
      height,
      frameRate: fps,
    },
    audio: {
      codec: config.muxerAudioCodec,
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_SAMPLE_RATE,
    },
    fastStart: "in-memory",
  });

  bundle.videoEncoder = new VideoEncoder({
    output: (chunk, meta) => bundle.muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      console.error("VideoEncoder error:", e);
      bundle.encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  bundle.videoEncoder.configure(config.videoConfig);

  bundle.audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      bundle.muxer.addAudioChunk(chunk, meta);
      bundle.audioChunkCount++;
    },
    error: (e) => {
      console.error("AudioEncoder error:", e);
      bundle.encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  bundle.audioEncoder.configure(config.audioConfig);

  return bundle;
}

/**
 * Encode pre-mixed audio buffer into the muxer via AudioEncoder.
 * Feeds audio in chunks of 1024 samples.
 * NOTE: Does NOT flush the encoder — caller must use finalizeMuxer() for that.
 */
export async function encodeAudio(
  audioEncoder: AudioEncoder,
  mixedAudio: AudioBuffer
): Promise<void> {
  const chunkSize = 1024;
  const totalFrames = mixedAudio.length;
  const sampleRate = mixedAudio.sampleRate;
  const ch0 = mixedAudio.getChannelData(0);
  const ch1 =
    mixedAudio.numberOfChannels > 1
      ? mixedAudio.getChannelData(1)
      : ch0;

  // Pre-allocate buffer for full chunks; only create smaller one for final partial chunk
  const fullChunkBuffer = new Float32Array(chunkSize * 2);

  for (let offset = 0; offset < totalFrames; offset += chunkSize) {
    // Bail if encoder errored asynchronously (transitions to "closed" state)
    if (audioEncoder.state !== "configured") break;

    const numFrames = Math.min(chunkSize, totalFrames - offset);
    const data = numFrames === chunkSize ? fullChunkBuffer : new Float32Array(numFrames * 2);
    data.set(ch0.subarray(offset, offset + numFrames), 0);
    data.set(ch1.subarray(offset, offset + numFrames), numFrames);

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: numFrames,
      numberOfChannels: AUDIO_CHANNELS,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data,
    });

    try {
      audioEncoder.encode(audioData);
    } finally {
      audioData.close();
    }
  }

}

/**
 * Encode a single video frame from a canvas.
 * Handles backpressure by waiting when encoder queue is deep.
 */
export async function encodeVideoFrame(
  videoEncoder: VideoEncoder,
  canvas: HTMLCanvasElement,
  frameIndex: number,
  fps: number,
  keyFrameInterval: number = 60
): Promise<void> {
  // Bail if encoder errored asynchronously
  if (videoEncoder.state !== "configured") return;

  if (videoEncoder.encodeQueueSize > 10) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (videoEncoder.encodeQueueSize <= 5) {
          videoEncoder.removeEventListener("dequeue", check);
          resolve();
        }
      };
      videoEncoder.addEventListener("dequeue", check);
      check(); // check immediately in case queue already drained
      setTimeout(() => {
        videoEncoder.removeEventListener("dequeue", check);
        console.warn(`[encodeVideoFrame] Backpressure timeout at frame ${frameIndex}, queue: ${videoEncoder.encodeQueueSize}`);
        resolve();
      }, 2000);
    });
  }

  // Re-check after backpressure wait
  if (videoEncoder.state !== "configured") return;

  const timestamp = Math.round((frameIndex / fps) * 1_000_000);
  const duration = Math.round((1 / fps) * 1_000_000);

  const frame = new VideoFrame(canvas, { timestamp, duration });

  try {
    videoEncoder.encode(frame, {
      keyFrame: frameIndex % keyFrameInterval === 0,
    });
  } finally {
    frame.close();
  }
}

/**
 * Finalize encoding and return the MP4 blob.
 */
export async function finalizeMuxer(
  bundle: MuxerBundle
): Promise<Blob> {
  try {
    // Only flush encoders that are still in configured state (not errored/closed)
    if (bundle.videoEncoder.state === "configured") {
      await bundle.videoEncoder.flush();
    }
    if (bundle.audioEncoder.state === "configured") {
      await bundle.audioEncoder.flush();
    }

    if (bundle.encoderError) {
      throw bundle.encoderError;
    }

    bundle.muxer.finalize();
  } finally {
    try { bundle.videoEncoder.close(); } catch {}
    try { bundle.audioEncoder.close(); } catch {}
  }

  return new Blob([bundle.target.buffer], { type: "video/mp4" });
}
