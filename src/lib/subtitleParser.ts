import { v4 as uuidv4 } from "uuid";
import type { PhraseCaption } from "@/types";

function parseTimeSRT(timeStr: string): number {
  // Format: HH:MM:SS,mmm
  const parts = timeStr.trim().split(":");
  const [sec, ms] = parts[2].split(",");
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(sec) + parseInt(ms) / 1000;
}

function parseTimeVTT(timeStr: string): number {
  // Format: HH:MM:SS.mmm or MM:SS.mmm
  const parts = timeStr.trim().split(":");
  if (parts.length === 3) {
    const [sec, ms] = parts[2].split(".");
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(sec) + parseInt(ms) / 1000;
  }
  // MM:SS.mmm
  const [sec, ms] = parts[1].split(".");
  return parseInt(parts[0]) * 60 + parseInt(sec) + parseInt(ms) / 1000;
}

export function parseSRT(content: string): PhraseCaption[] {
  const captions: PhraseCaption[] = [];
  const blocks = content.trim().split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 3) continue;

    // Line 1: sequence number (skip)
    // Line 2: timestamps
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;

    const startTime = parseTimeSRT(timeMatch[1]);
    const endTime = parseTimeSRT(timeMatch[2]);
    // Line 3+: text
    const text = lines
      .slice(2)
      .join(" ")
      .replace(/<[^>]+>/g, "") // strip HTML tags
      .trim();

    if (text) {
      captions.push({
        id: uuidv4(),
        startTime,
        endTime,
        text,
      });
    }
  }

  return captions;
}

export function parseVTT(content: string): PhraseCaption[] {
  const captions: PhraseCaption[] = [];
  // Remove WEBVTT header and NOTE blocks (which continue until a blank line)
  const body = content.replace(/^WEBVTT[^\n]*\n/, "").replace(/^NOTE\b[^]*?(?:\r?\n\r?\n|$)/gm, "");
  const blocks = body.trim().split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    // Find the line with timestamps
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx === -1) continue;

    const timeMatch = lines[timeLineIdx].match(
      /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/
    );
    if (!timeMatch) continue;

    const startTime = parseTimeVTT(timeMatch[1]);
    const endTime = parseTimeVTT(timeMatch[2]);
    const text = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (text) {
      captions.push({
        id: uuidv4(),
        startTime,
        endTime,
        text,
      });
    }
  }

  return captions;
}

export async function parseSubtitleFile(file: File): Promise<PhraseCaption[]> {
  const content = await file.text();
  const ext = file.name.toLowerCase().split(".").pop();

  if (ext === "vtt") {
    return parseVTT(content);
  }
  // Default to SRT
  return parseSRT(content);
}
