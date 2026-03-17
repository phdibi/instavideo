export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds) || seconds < 0) {
    return "00:00.00";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function parseTime(timeStr: string): number {
  // Match "MM:SS.CC" or "MM:SS" or bare number
  const match = timeStr.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const cs = match[3] ? parseInt(match[3].padEnd(2, "0").slice(0, 2), 10) : 0;
    const result = mins * 60 + secs + cs / 100;
    return isFinite(result) ? result : 0;
  }
  const num = parseFloat(timeStr);
  return isFinite(num) ? num : 0;
}
