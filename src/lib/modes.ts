import type { ModeSegment, VideoMode, PhraseCaption, TranscriptionResult, StanzaConfig } from "@/types";
import { v4 as uuid } from "uuid";

/** Get the current mode segment for a given time (binary search, O(log n)) */
export function getCurrentMode(segments: ModeSegment[], time: number): ModeSegment | null {
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const seg = segments[mid];
    if (time < seg.startTime) hi = mid - 1;
    else if (time >= seg.endTime) lo = mid + 1;
    else return seg;
  }
  return null;
}

/** Get the mode type at a given time, defaulting to "presenter" */
export function getModeAt(segments: ModeSegment[], time: number): VideoMode {
  const seg = getCurrentMode(segments, time);
  return seg?.mode || "presenter";
}

/** Connector words that never get emphasis — hoisted to module scope to avoid re-creation per call */
const CONNECTORS = new Set([
  'a','o','e','em','de','do','da','no','na','um','uma','que',
  'para','por','com','se','os','as','dos','das','nos','nas',
  'ao','à','the','an','in','on','of','to','and','or','is',
  'are','was','with','for','at','by','it','eu','ele','ela',
  'mas','mais','não','como','seu','sua','isso','este','esta',
]);

/** Check if a word should receive emphasis (large/bold/italic serif) treatment */
function isEmphasisWord(word: string): boolean {
  const cleaned = word.replace(/[.,!?;:]/g, '').toLowerCase();
  if (/\d/.test(cleaned)) return true; // números
  if (CONNECTORS.has(cleaned)) return false;
  return cleaned.length >= 3; // palavras substantivas
}

/** Generate phrase captions (1-2 words each) from transcription word timings.
 *  Every ~intervalSeconds, creates a stanza of words that stack vertically on screen
 *  with mixed typography (emphasis vs connector). */
export function generatePhraseCaptions(transcription: TranscriptionResult, stanzaConfig?: Partial<StanzaConfig>): PhraseCaption[] {
  const stanzaEnabled = stanzaConfig?.enabled ?? true;
  const intervalSeconds = stanzaConfig?.intervalSeconds ?? 4;
  const wordsPerStanza = stanzaConfig?.wordsPerStanza ?? 3;
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
  let lastStanzaEnd = 0;

  while (i < allWords.length) {
    const currentWord = allWords[i];
    const remaining = allWords.length - i;
    const timeSinceLastStanza = currentWord.start - lastStanzaEnd;

    // Create a stanza every ~intervalSeconds if enabled and we have enough words
    if (stanzaEnabled && timeSinceLastStanza >= intervalSeconds && remaining >= 4) {
      const stanzaSize = Math.min(remaining, wordsPerStanza);
      const stanzaWords = allWords.slice(i, i + stanzaSize);
      const stanzaEndTime = stanzaWords[stanzaWords.length - 1].end;
      const sid = uuid();

      for (const sw of stanzaWords) {
        phrases.push({
          id: uuid(),
          startTime: sw.start,
          endTime: stanzaEndTime, // all words stay visible until stanza ends
          text: sw.word,
          isEmphasis: isEmphasisWord(sw.word),
          stanzaId: sid,
        });
      }

      lastStanzaEnd = stanzaEndTime;
      i += stanzaSize;
    } else {
      // Normal phrase: 1-2 words, no stanzaId
      const groupSize = Math.min(remaining, 2);
      const group = allWords.slice(i, i + groupSize);

      phrases.push({
        id: uuid(),
        startTime: group[0].start,
        endTime: group[group.length - 1].end,
        text: group.map((w) => w.word).join(" "),
      });

      i += groupSize;
    }
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
