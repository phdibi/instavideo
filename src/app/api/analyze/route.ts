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
          `Segment ${i + 1}: [${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s] "${s.text}"`
      )
      .join("\n");

    // The AI only generates EFFECTS and B-ROLL. Captions are built deterministically from transcription.
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a cinematic video editor AI. Create an EFFECTS and B-ROLL plan for this video. Do NOT create captions - they are handled separately.

VIDEO DURATION: ${videoDuration} seconds

TRANSCRIPTION SEGMENTS:
${segmentList}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks.

=== EFFECTS ===
Create an array of effects synchronized to the segments above.

Available effect types:
- "zoom-in": params: { "scale": 1.2, "focusX": 0.5, "focusY": 0.35 }
- "zoom-out": params: { "scale": 1.2 }
- "zoom-pulse": params: { "scale": 1.15 }
- "pan-left" / "pan-right": params: { "distance": 20 }
- "shake": params: { "intensity": 3, "frequency": 15 }
- "transition-fade": params: { "duration": 0.4 }
- "transition-glitch": params: { "intensity": 5 }
- "vignette": params: { "intensity": 0.3 }
- "letterbox": params: { "amount": 0.08 }
- "flash": params: { "color": "#FFFFFF", "duration": 0.15 }
- "color-grade": params: { "preset": "cinematic-warm" }

EFFECT RULES:
1. Create ONE zoom effect per segment (alternate between zoom-in, zoom-out, zoom-pulse)
2. Each effect startTime/endTime MUST match a segment's start/end times exactly
3. Effects of same type must NOT overlap
4. Also add 2-3 vignette/letterbox/color-grade effects spanning multiple segments
5. Add transition-fade between major topic changes (0.3s duration at segment boundaries)
6. Total: roughly 1 effect per segment + a few overlaying visual effects

=== B-ROLL ===
Suggest 3-5 b-roll images.

B-ROLL RULES:
- Space evenly across the video timeline
- Duration: 1.5-2.5 seconds each
- Prompt must describe a cinematic image (include: subject, style, lighting, mood, composition)
- timestamp should be the start time of a relevant segment

=== RETURN THIS EXACT JSON ===
{
  "effects": [
    {
      "id": "effect_1",
      "type": "zoom-in",
      "startTime": 0.0,
      "endTime": 2.0,
      "params": { "scale": 1.3, "focusX": 0.5, "focusY": 0.35 }
    }
  ],
  "bRollSuggestions": [
    {
      "id": "broll_1",
      "timestamp": 5.0,
      "duration": 2.0,
      "prompt": "cinematic close-up of...",
      "reason": "relates to speech about..."
    }
  ],
  "overallMood": "intense",
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
    editPlan.captions = []; // Captions will be built client-side

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
