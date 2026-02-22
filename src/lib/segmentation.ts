/**
 * SegmentationService — MediaPipe ImageSegmenter wrapper.
 *
 * Uses the selfie_segmenter model to separate person from background.
 * Follows the same singleton pattern as FFmpegService.
 *
 * Two modes:
 *  - VIDEO: synchronous, for frame-by-frame export
 *  - IMAGE: single-frame, for preview snapshots
 *
 * The model is loaded lazily from CDN (~2MB) on first use.
 */

import {
  ImageSegmenter,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

// Re-export types for consumers
export type SegmentationMask = {
  data: Uint8Array;
  width: number;
  height: number;
};

export class SegmentationService {
  private static instance: ImageSegmenter | null = null;
  private static loadingPromise: Promise<ImageSegmenter> | null = null;
  private static currentMode: "IMAGE" | "VIDEO" = "IMAGE";

  /**
   * Get or create the singleton ImageSegmenter instance.
   * First call downloads the model from CDN.
   */
  public static async getInstance(): Promise<ImageSegmenter> {
    if (this.instance) return this.instance;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      console.log("[CineAI] Loading MediaPipe selfie segmentation model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
        runningMode: "IMAGE",
      });

      console.log("[CineAI] Segmentation model loaded successfully");
      this.instance = segmenter;
      this.currentMode = "IMAGE";
      return segmenter;
    })();

    return this.loadingPromise;
  }

  /**
   * Switch to VIDEO mode (synchronous, timestamped — for export).
   */
  public static async setVideoMode(): Promise<void> {
    if (this.currentMode === "VIDEO") return;
    const segmenter = await this.getInstance();
    await segmenter.setOptions({ runningMode: "VIDEO" });
    this.currentMode = "VIDEO";
  }

  /**
   * Switch to IMAGE mode (single frame — for preview).
   */
  public static async setImageMode(): Promise<void> {
    if (this.currentMode === "IMAGE") return;
    const segmenter = await this.getInstance();
    await segmenter.setOptions({ runningMode: "IMAGE" });
    this.currentMode = "IMAGE";
  }

  /**
   * Segment a single video frame (IMAGE mode).
   * Returns a mask where 255 = person, 0 = background.
   */
  public static segmentImage(
    source: HTMLVideoElement | HTMLCanvasElement
  ): SegmentationMask | null {
    if (!this.instance) return null;

    const result = this.instance.segment(source);
    return this.extractMask(result);
  }

  /**
   * Segment a video frame with timestamp (VIDEO mode — for export).
   * Must be called with monotonically increasing timestamps.
   */
  public static segmentVideoFrame(
    source: HTMLVideoElement | HTMLCanvasElement,
    timestampMs: number
  ): SegmentationMask | null {
    if (!this.instance) return null;

    const result = this.instance.segmentForVideo(source, timestampMs);
    return this.extractMask(result);
  }

  /**
   * Extract the category mask from a segmentation result.
   * Returns a simple { data, width, height } object.
   * Mask values: 0 = background, non-zero = person.
   */
  private static extractMask(
    result: ReturnType<ImageSegmenter["segment"]>
  ): SegmentationMask | null {
    if (!result.categoryMask) return null;

    const mask = result.categoryMask;
    const width = mask.width;
    const height = mask.height;
    // Copy the mask data since the underlying buffer may be recycled
    const data = new Uint8Array(mask.getAsUint8Array());

    // Close the result to free GPU memory
    result.close();

    return { data, width, height };
  }

  /**
   * Apply a segmentation mask to isolate the person from a video frame.
   * Draws: background image → person (masked from original frame) → optional microphone.
   *
   * @param ctx        - Target canvas context (will be modified in place)
   * @param videoFrame - The original video frame (HTMLVideoElement or canvas)
   * @param mask       - Segmentation mask from segmentImage/segmentVideoFrame
   * @param bgImage    - Background image to use (null = dark fallback)
   * @param canvasW    - Canvas width
   * @param canvasH    - Canvas height
   * @param smoothing  - Edge smoothing strength 0-1 (applies blur to mask edges)
   */
  public static compositeFrame(
    ctx: CanvasRenderingContext2D,
    videoFrame: HTMLVideoElement | HTMLCanvasElement,
    mask: SegmentationMask,
    bgImage: HTMLImageElement | null,
    canvasW: number,
    canvasH: number,
    smoothing: number = 0.5
  ): void {
    // Step 1: Draw background (cover mode)
    ctx.save();
    if (bgImage) {
      const imgAspect = bgImage.naturalWidth / bgImage.naturalHeight;
      const canvasAspect = canvasW / canvasH;
      let dw: number, dh: number, dx: number, dy: number;
      if (imgAspect > canvasAspect) {
        dh = canvasH;
        dw = canvasH * imgAspect;
        dx = (canvasW - dw) / 2;
        dy = 0;
      } else {
        dw = canvasW;
        dh = canvasW / imgAspect;
        dx = 0;
        dy = (canvasH - dh) / 2;
      }
      ctx.drawImage(bgImage, dx, dy, dw, dh);
    } else {
      // Fallback: dark professional background
      const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
      grad.addColorStop(0, "#0a0a1a");
      grad.addColorStop(1, "#1a1a2e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
    ctx.restore();

    // Step 2: Create masked person on offscreen canvas
    const offscreen = document.createElement("canvas");
    offscreen.width = canvasW;
    offscreen.height = canvasH;
    const offCtx = offscreen.getContext("2d")!;

    // Draw the original video frame onto offscreen
    // Use the same center-crop logic as the main pipeline
    const vw = videoFrame instanceof HTMLVideoElement ? videoFrame.videoWidth : videoFrame.width;
    const vh = videoFrame instanceof HTMLVideoElement ? videoFrame.videoHeight : videoFrame.height;
    const videoAspect = vw / vh;
    const targetAspect = canvasW / canvasH;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }
    offCtx.drawImage(videoFrame, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

    // Step 3: Apply mask to the person frame
    const personData = offCtx.getImageData(0, 0, canvasW, canvasH);
    const pixels = personData.data;
    const scaleX = mask.width / canvasW;
    const scaleY = mask.height / canvasH;

    // Smoothing via expanded mask (bilinear sample for softer edges)
    const smoothRadius = Math.round(smoothing * 3); // 0-3 pixel radius

    for (let py = 0; py < canvasH; py++) {
      for (let px = 0; px < canvasW; px++) {
        const pixelIdx = (py * canvasW + px) * 4;

        if (smoothRadius > 0) {
          // Sample multiple mask points for edge softening
          let sum = 0;
          let count = 0;
          for (let dy = -smoothRadius; dy <= smoothRadius; dy++) {
            for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
              const mx = Math.floor((px + dx) * scaleX);
              const my = Math.floor((py + dy) * scaleY);
              if (mx >= 0 && mx < mask.width && my >= 0 && my < mask.height) {
                const maskIdx = my * mask.width + mx;
                sum += mask.data[maskIdx] > 0 ? 1 : 0;
                count++;
              }
            }
          }
          const alpha = Math.round((sum / count) * 255);
          pixels[pixelIdx + 3] = alpha;
        } else {
          // No smoothing — hard mask
          const mx = Math.floor(px * scaleX);
          const my = Math.floor(py * scaleY);
          const maskIdx = my * mask.width + mx;
          pixels[pixelIdx + 3] = mask.data[maskIdx] > 0 ? 255 : 0;
        }
      }
    }

    offCtx.putImageData(personData, 0, 0);

    // Step 4: Composite masked person onto the background
    ctx.drawImage(offscreen, 0, 0);
  }

  /**
   * Draw a podcast condenser microphone at bottom-center of the canvas.
   * Uses canvas primitives for a clean, resolution-independent rendering.
   */
  public static drawMicrophone(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number
  ): void {
    const micWidth = canvasW * 0.06; // 6% of canvas width
    const micHeight = micWidth * 3.2;
    const centerX = canvasW / 2;
    const bottomY = canvasH * 0.92;

    ctx.save();

    // --- Stand/arm (from bottom, going up) ---
    const standTopY = bottomY - micHeight;
    const standBottomY = bottomY;
    const armWidth = micWidth * 0.12;

    // Vertical pole
    const poleGrad = ctx.createLinearGradient(centerX - armWidth, 0, centerX + armWidth, 0);
    poleGrad.addColorStop(0, "#2a2a2a");
    poleGrad.addColorStop(0.5, "#4a4a4a");
    poleGrad.addColorStop(1, "#2a2a2a");
    ctx.fillStyle = poleGrad;
    ctx.fillRect(centerX - armWidth, standTopY + micHeight * 0.4, armWidth * 2, micHeight * 0.6);

    // --- Shock mount ring ---
    const mountY = standTopY + micHeight * 0.38;
    const mountRadius = micWidth * 0.35;
    ctx.beginPath();
    ctx.arc(centerX, mountY, mountRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = micWidth * 0.06;
    ctx.stroke();

    // --- Microphone body (capsule shape) ---
    const bodyTop = standTopY;
    const bodyBottom = standTopY + micHeight * 0.42;
    const bodyWidth = micWidth * 0.5;

    // Body gradient (metallic dark)
    const bodyGrad = ctx.createLinearGradient(centerX - bodyWidth, 0, centerX + bodyWidth, 0);
    bodyGrad.addColorStop(0, "#1a1a1a");
    bodyGrad.addColorStop(0.3, "#3a3a3a");
    bodyGrad.addColorStop(0.5, "#4a4a4a");
    bodyGrad.addColorStop(0.7, "#3a3a3a");
    bodyGrad.addColorStop(1, "#1a1a1a");

    // Rounded rectangle body
    const bodyRadius = bodyWidth * 0.8;
    ctx.beginPath();
    ctx.roundRect(centerX - bodyWidth, bodyTop, bodyWidth * 2, bodyBottom - bodyTop, [bodyRadius, bodyRadius, bodyWidth * 0.3, bodyWidth * 0.3]);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Body outline
    ctx.strokeStyle = "rgba(100,100,100,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- Grille mesh pattern ---
    const grilleTop = bodyTop + (bodyBottom - bodyTop) * 0.05;
    const grilleBottom = bodyTop + (bodyBottom - bodyTop) * 0.55;
    const grilleWidth = bodyWidth * 0.85;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(centerX - grilleWidth, grilleTop, grilleWidth * 2, grilleBottom - grilleTop, bodyRadius * 0.8);
    ctx.clip();

    // Horizontal mesh lines
    ctx.strokeStyle = "rgba(80,80,80,0.6)";
    ctx.lineWidth = 0.8;
    const meshSpacing = micWidth * 0.06;
    for (let y = grilleTop; y < grilleBottom; y += meshSpacing) {
      ctx.beginPath();
      ctx.moveTo(centerX - grilleWidth, y);
      ctx.lineTo(centerX + grilleWidth, y);
      ctx.stroke();
    }
    // Vertical mesh lines
    for (let x = centerX - grilleWidth; x < centerX + grilleWidth; x += meshSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, grilleTop);
      ctx.lineTo(x, grilleBottom);
      ctx.stroke();
    }
    ctx.restore();

    // --- Subtle shadow behind microphone ---
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.ellipse(centerX + micWidth * 0.1, standBottomY, micWidth * 0.5, micWidth * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /**
   * Cleanup: close the segmenter and free resources.
   */
  public static destroy(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
      this.loadingPromise = null;
      this.currentMode = "IMAGE";
      console.log("[CineAI] Segmentation model destroyed");
    }
  }
}
