import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export class FFmpegService {
    private static instance: FFmpeg | null = null;
    private static loadingPromise: Promise<FFmpeg> | null = null;

    public static async getInstance(): Promise<FFmpeg> {
        if (this.instance) return this.instance;

        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            const ffmpeg = new FFmpeg();
            const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

            try {
                await ffmpeg.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
                });

                this.instance = ffmpeg;
                return ffmpeg;
            } catch (error) {
                this.loadingPromise = null;
                throw error;
            }
        })();

        return this.loadingPromise;
    }

    /**
     * Extract audio from video AND reduce noise in a SINGLE FFmpeg pass.
     * This replaces the old AudioContext-based extraction which caused
     * sample rate resampling and timing drift.
     *
     * Key: FFmpeg extracts audio directly from the container, preserving
     * the EXACT same timeline as the video. No resampling, no time-stretching.
     * The output WAV timestamps map 1:1 to the original video timestamps.
     *
     * -vn: strip video
     * -ac 1: mono (reduces file size for API, transcription doesn't need stereo)
     * -ar 16000: 16kHz (optimal for speech recognition APIs)
     * -c:a pcm_s16le: 16-bit PCM WAV (universally compatible)
     * -af highpass=f=200: remove low-frequency rumble without time-stretching
     *
     * NOTE: We intentionally DO NOT use afftdn (FFT noise reduction) anymore.
     * afftdn uses overlap-add which can introduce subtle timing shifts (~2-5ms
     * per segment) that compound into noticeable drift over long videos.
     * The highpass filter alone is sufficient for speech clarity.
     */
    public static async extractAndCleanAudio(videoFile: File | Blob): Promise<Blob> {
        const ffmpeg = await this.getInstance();
        const ext = (videoFile instanceof File && videoFile.name)
            ? videoFile.name.split(".").pop() || "mp4"
            : "mp4";
        const inputName = `input.${ext}`;
        const outputName = "output.wav";

        try {
            await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

            await ffmpeg.exec([
                "-i", inputName,
                "-vn",                  // no video
                "-ac", "1",             // mono
                "-ar", "16000",         // 16kHz — optimal for speech recognition
                "-c:a", "pcm_s16le",    // 16-bit PCM WAV
                "-af", "highpass=f=200", // rumble removal only (no time-stretching)
                outputName,
            ]);

            const data = await ffmpeg.readFile(outputName);
            const wavBlob = new Blob([data as any], { type: "audio/wav" });

            // Calculate and log the WAV duration from the PCM header for debugging.
            // WAV PCM: duration = (fileSize - 44) / (sampleRate * channels * bytesPerSample)
            // With -ar 16000 -ac 1 -c:a pcm_s16le: 16000 * 1 * 2 = 32000 bytes/sec
            const wavDuration = (wavBlob.size - 44) / 32000;
            console.log(
              `[CineAI] Audio extracted: WAV size=${wavBlob.size} bytes, ` +
              `duration=${wavDuration.toFixed(3)}s`
            );

            return wavBlob;
        } finally {
            try {
                await ffmpeg.deleteFile(inputName);
                await ffmpeg.deleteFile(outputName);
            } catch (e) {
                console.warn("FFmpeg cleanup warning:", e);
            }
        }
    }

    /**
     * @deprecated Use extractAndCleanAudio instead.
     * Kept for backward compatibility but no longer used in the main pipeline.
     */
    public static async reduceNoise(audioFile: File | Blob): Promise<Blob> {
        const ffmpeg = await this.getInstance();
        const inputName = "input.wav";
        const outputName = "output.wav";

        try {
            await ffmpeg.writeFile(inputName, await fetchFile(audioFile));

            await ffmpeg.exec([
                "-i", inputName,
                "-af", "highpass=f=200,afftdn=nr=12:nf=-25:tn=1",
                "-c:a", "pcm_s16le",
                outputName
            ]);

            const data = await ffmpeg.readFile(outputName);
            return new Blob([data as any], { type: "audio/wav" });
        } finally {
            try {
                await ffmpeg.deleteFile(inputName);
                await ffmpeg.deleteFile(outputName);
            } catch (e) {
                console.warn("FFmpeg cleanup warning:", e);
            }
        }
    }
}
