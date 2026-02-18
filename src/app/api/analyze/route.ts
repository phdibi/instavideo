import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const { transcription, videoDuration } = await request.json();

    const ai = new GoogleGenAI({ apiKey });

    const segments = transcription.segments || [];
    const segmentList = segments
      .map(
        (s: { start: number; end: number; text: string }, i: number) =>
          `[${i + 1}] ${s.start.toFixed(2)}s-${s.end.toFixed(2)}s: "${s.text}"`
      )
      .join("\n");

    const numSegments = segments.length;

    // The AI only generates EFFECTS and B-ROLL. Captions are built deterministically from transcription.
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a professional cinematic video editor. Generate EFFECTS and B-ROLL for this talking-head video.

VIDEO: ${videoDuration.toFixed(1)}s, ${numSegments} speech segments.

SEGMENTS:
${segmentList}

Return ONLY valid JSON (no markdown, no code blocks).

EFFECTS INSTRUCTIONS:
Add zoom effects SELECTIVELY — NOT on every segment. Zooms should emphasize key moments:
- The HOOK (first 3 seconds): One zoom-in with stronger scale (1.25-1.35)
- Key emotional/impactful moments: zoom-in or zoom-pulse
- Topic transitions/Pauses: zoom-out to "reset" framing or insert transition-fade
- Short punchy phrases (< 2 seconds, ≤ 5 words): zoom-pulse for emphasis

PAUSE & TRANSITION DETECTION:
- Look for gaps between segments (e.g. Seg 1 ends at 5.0s, Seg 2 starts at 6.0s = 1.0s pause).
- If pause > 0.8s, SUGGEST a transition-fade or a B-roll insertion.
- If pause is a "topic change", suggest a zoom-out effect on the next segment.

IMPORTANT: Only add zooms to roughly 30-40% of segments. Leave most segments WITHOUT zoom for a clean, professional look. Too many zooms feels amateur and distracting.

Zoom params:
- zoom-in: scale 1.15-1.25, focusX 0.5, focusY 0.35
- zoom-out: scale 1.10-1.20
- zoom-pulse: scale 1.05-1.12

Also add these GLOBAL effects:
- One color-grade from 0 to ${videoDuration.toFixed(1)}: {"preset":"cinematic-warm"}
- One vignette from 0 to ${videoDuration.toFixed(1)}: {"intensity":0.2}

Add transition-fade (0.3s) at gaps between segments where silence > 0.5s.

EXPECTED: ~${Math.max(2, Math.ceil(numSegments * 0.35))} zooms + 2 globals + a few transitions.

B-ROLL INSTRUCTIONS:
Suggest 3-5 b-roll images spaced evenly across the video.
- timestamp = a segment's start time
- duration: 1.5-2.5s
- prompt: cinematic image description (subject, style, lighting, mood)

RETURN THIS JSON:
{
  "effects": [
    {"id":"e1","type":"zoom-in","startTime":0.0,"endTime":2.5,"params":{"scale":1.25,"focusX":0.5,"focusY":0.35}},
    {"id":"e2","type":"zoom-out","startTime":8.0,"endTime":10.5,"params":{"scale":1.15}},
    {"id":"cg","type":"color-grade","startTime":0,"endTime":${videoDuration.toFixed(1)},"params":{"preset":"cinematic-warm"}},
    {"id":"vig","type":"vignette","startTime":0,"endTime":${videoDuration.toFixed(1)},"params":{"intensity":0.2}}
  ],
  "bRollSuggestions": [
    {"id":"b1","timestamp":5.0,"duration":2.0,"prompt":"cinematic close-up description","reason":"context"}
  ],
  "overallMood": "energetic",
  "pacing": "dynamic",
  "colorGrade": "cinematic-warm"
}`,
            },
          ],
        },
      ],
    });

    const text = response?.text || "";
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const editPlan = JSON.parse(cleaned);

    // Ensure required fields
    editPlan.effects = editPlan.effects || [];
    editPlan.bRollSuggestions = editPlan.bRollSuggestions || [];
    editPlan.captions = []; // Captions are built client-side

    return NextResponse.json(editPlan);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      {
        error:
          "Analysis failed: " +
          (error instanceof Error ? error.message : "Unknown error"),
      },
      { status: 500 }
    );
  }
}
