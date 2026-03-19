/**
 * Shared canvas drawing helpers used by ExportPanel.
 * Extracted to reduce ExportPanel size and enable reuse.
 */

/** Word-wrap text for canvas (fillText has no auto-wrap) */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Draw a rounded rectangle path */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw video or image covering the given rect (center crop) */
export function drawMediaCover(
  ctx: CanvasRenderingContext2D,
  media: HTMLVideoElement | HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const isVideo = media instanceof HTMLVideoElement;
  const mw = isVideo ? media.videoWidth : media.naturalWidth;
  const mh = isVideo ? media.videoHeight : media.naturalHeight;
  if (!mw || !mh) return;

  const targetRatio = dw / dh;
  const mediaRatio = mw / mh;

  let sx = 0, sy = 0, sw = mw, sh = mh;
  if (mediaRatio > targetRatio) {
    sw = mh * targetRatio;
    sx = (mw - sw) / 2;
  } else {
    sh = mw / targetRatio;
    sy = (mh - sh) / 2;
  }

  ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** @deprecated Use drawMediaCover instead — works for both video and image elements */
export const drawVideoCover = drawMediaCover;
