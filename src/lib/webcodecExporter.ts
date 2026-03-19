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
 * Returns null if WebCodecs is not supported or no codec combo works.
 */
export async function probeWebCodecs(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<WebCodecsConfig | null> {
  if (!isWebCodecsAvailable()) return null;

  // Try H.264 High Profile + AAC-LC → MP4
  const h264Configs: { codec: string; muxerCodec: "avc" }[] = [
    { codec: "avc1.640028", muxerCodec: "avc" }, // High Profile Level 4.0
    { codec: "avc1.42001f", muxerCodec: "avc" }, // Baseline Profile Level 3.1
  ];

  const aacConfig: AudioEncoderConfig = {
    codec: "mp4a.40.2", // AAC-LC
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: AUDIO_BITRATE,
  };

  for (const { codec, muxerCodec } of h264Configs) {
    try {
      const videoConfig: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: "quality",
        bitrateMode: "variable",
      };

      const [videoSupport, audioSupport] = await Promise.all([
        VideoEncoder.isConfigSupported(videoConfig),
        AudioEncoder.isConfigSupported(aacConfig),
      ]);

      if (
        videoSupport.supported &&
        audioSupport.supported &&
        videoSupport.config &&
        audioSupport.config
      ) {
        return {
          videoCodec: codec,
          videoConfig: videoSupport.config,
          audioCodec: "mp4a.40.2",
          audioConfig: audioSupport.config,
          container: "mp4",
          muxerVideoCodec: muxerCodec,
          muxerAudioCodec: "aac",
        };
      }
    } catch {
      // Config not supported, try next
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
    // Already at the right time (within ~30ms, typical keyframe precision)
    if (Math.abs(video.currentTime - time) < 0.03) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      // Resolve instead of reject — a stale frame is better than crashing the export
      resolve();
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
  /** Set to an Error if any encoder reports an error asynchronously */
  encoderError: Error | null;
}

/**
 * Create the muxer + encoders bundle.
 * Encoder errors are captured in bundle.encoderError for the caller to check.
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
    output: (chunk, meta) => bundle.muxer.addAudioChunk(chunk, meta),
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

  for (let offset = 0; offset < totalFrames; offset += chunkSize) {
    const numFrames = Math.min(chunkSize, totalFrames - offset);
    // Create planar float32 data (ch0 followed by ch1)
    const data = new Float32Array(numFrames * 2);
    data.set(ch0.subarray(offset, offset + numFrames), 0);
    data.set(ch1.subarray(offset, offset + numFrames), numFrames);

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: numFrames,
      numberOfChannels: AUDIO_CHANNELS,
      timestamp: Math.round((offset / sampleRate) * 1_000_000), // microseconds
      data,
    });

    try {
      audioEncoder.encode(audioData);
    } finally {
      audioData.close();
    }
  }

  await audioEncoder.flush();
}

/**
 * Encode a single video frame from a canvas.
 * Checks encoder queue size and waits if backpressure is too high.
 */
export async function encodeVideoFrame(
  videoEncoder: VideoEncoder,
  canvas: HTMLCanvasElement,
  frameIndex: number,
  fps: number,
  keyFrameInterval: number = 60
): Promise<void> {
  // Backpressure: wait if encoder queue is too deep (prevents OOM on long videos)
  if (videoEncoder.encodeQueueSize > 10) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (videoEncoder.encodeQueueSize <= 5) {
          videoEncoder.removeEventListener("dequeue", check);
          resolve();
        }
      };
      videoEncoder.addEventListener("dequeue", check);
      // Safety: resolve after 2s even if queue doesn't drain
      setTimeout(() => {
        videoEncoder.removeEventListener("dequeue", check);
        resolve();
      }, 2000);
    });
  }

  const timestamp = Math.round((frameIndex / fps) * 1_000_000); // microseconds
  const duration = Math.round((1 / fps) * 1_000_000);

  const frame = new VideoFrame(canvas, {
    timestamp,
    duration,
  });

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
 * Flushes both encoders and closes them in a finally block.
 */
export async function finalizeMuxer(
  bundle: MuxerBundle
): Promise<Blob> {
  try {
    // Flush both encoders before finalizing the muxer
    await bundle.videoEncoder.flush();
    // Audio was already flushed in encodeAudio(), but flush again for safety (no-op if already flushed)
    await bundle.audioEncoder.flush();

    // Check for async encoder errors
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
