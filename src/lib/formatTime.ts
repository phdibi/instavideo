export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function parseTime(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    const [mins, rest] = parts;
    const [secs, ms] = rest.split(".");
    return (
      parseInt(mins) * 60 +
      parseInt(secs) +
      (ms ? parseInt(ms) / 100 : 0)
    );
  }
  return parseFloat(timeStr) || 0;
}
