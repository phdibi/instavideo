import type { ModeSegment, VideoMode, PhraseCaption, TranscriptionResult } from "@/types";
import { v4 as uuid } from "uuid";

/** Get the current mode segment for a given time */
export function getCurrentMode(segments: ModeSegment[], time: number): ModeSegment | null {
  return segments.find((s) => time >= s.startTime && time < s.endTime) || null;
}

/** Get the mode type at a given time, defaulting to "presenter" */
export function getModeAt(segments: ModeSegment[], time: number): VideoMode {
  const seg = getCurrentMode(segments, time);
  return seg?.mode || "presenter";
}

/** Generate phrase captions (1-2 words each) from transcription word timings */
export function generatePhraseCaptions(transcription: TranscriptionResult): PhraseCaption[] {
  const allWords: { word: string; start: number; end: number }[] = [];

  for (const segment of transcription.segments) {
    if (segment.words && segment.words.length > 0) {
      for (const w of segment.words) {
        allWords.push({ word: w.word, start: w.start, end: w.end });
      }
    } else {
      // Fallback: split segment text evenly
      const segWords = segment.text.split(" ").filter((w) => w.length > 0);
      const segDuration = segment.end - segment.start;
      segWords.forEach((word, i) => {
        const wordStart = segment.start + (i / segWords.length) * segDuration;
        const wordEnd = segment.start + ((i + 1) / segWords.length) * segDuration;
        allWords.push({ word, start: wordStart, end: wordEnd });
      });
    }
  }

  const phrases: PhraseCaption[] = [];
  let i = 0;

  while (i < allWords.length) {
    // Group 1-2 words per phrase
    const groupSize = Math.min(allWords.length - i, 2);
    const group = allWords.slice(i, i + groupSize);

    phrases.push({
      id: uuid(),
      startTime: group[0].start,
      endTime: group[group.length - 1].end,
      text: group.map((w) => w.word).join(" "),
    });

    i += groupSize;
  }

  return phrases;
}

/** Mode color for UI display */
export function getModeColor(mode: VideoMode): string {
  switch (mode) {
    case "presenter":
      return "#3B82F6"; // blue
    case "broll":
      return "#F97316"; // orange
    case "typography":
      return "#A855F7"; // purple
  }
}

/** Mode label for UI display */
export function getModeLabel(mode: VideoMode): string {
  switch (mode) {
    case "presenter":
      return "Presenter";
    case "broll":
      return "B-Roll";
    case "typography":
      return "Typography";
  }
}
