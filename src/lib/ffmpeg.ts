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

    public static async reduceNoise(audioFile: File | Blob): Promise<Blob> {
        const ffmpeg = await this.getInstance();
        const inputName = "input.wav";
        const outputName = "output.wav";

        try {
            await ffmpeg.writeFile(inputName, await fetchFile(audioFile));

            // Apply high-pass filter to remove rumble and afftdn for noise reduction
            // highpass=f=200: Low frequency rumble removal
            // afftdn=nr=12:nf=-25:tn=1: FFT-based noise reduction
            // nr: noise reduction in dB
            // nf: noise floor in dB
            await ffmpeg.exec([
                "-i", inputName,
                "-af", "highpass=f=200,afftdn=nr=12:nf=-25:tn=1",
                "-c:a", "pcm_s16le", // Ensure standardized WAV output
                outputName
            ]);

            const data = await ffmpeg.readFile(outputName);
            // Cast to any to avoid strict ArrayBufferLike vs ArrayBuffer type mismatch
            return new Blob([data as any], { type: "audio/wav" });
        } finally {
            // Cleanup
            try {
                await ffmpeg.deleteFile(inputName);
                await ffmpeg.deleteFile(outputName);
            } catch (e) {
                // Ignore cleanup errors
                console.warn("FFmpeg cleanup warning:", e);
            }
        }
    }
}
