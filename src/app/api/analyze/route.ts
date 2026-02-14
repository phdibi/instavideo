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

    // Build a simplified segment list for the prompt to ensure exact timestamp usage
    const segments = transcription.segments || [];
    const segmentList = segments.map((s: { start: number; end: number; text: string }, i: number) =>
      `Segment ${i + 1}: [${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s] "${s.text}"`
    ).join("\n");

    // Pre-build the caption instructions based on segments to be very explicit
    const captionInstructions = segments.map((s: { start: number; end: number; text: string }, i: number) => {
      const words = s.text.split(" ");
      // If segment is long (>8 words), suggest splitting
      if (words.length > 8) {
        const mid = Math.ceil(words.length / 2);
        const midTime = s.start + (s.end - s.start) * (mid / words.length);
        return `  cap_${i * 2 + 1}: startTime=${s.start.toFixed(2)}, endTime=${midTime.toFixed(2)}, text="${words.slice(0, mid).join(" ")}"
  cap_${i * 2 + 2}: startTime=${midTime.toFixed(2)}, endTime=${s.end.toFixed(2)}, text="${words.slice(mid).join(" ")}"`;
      }
      return `  cap_${i + 1}: startTime=${s.start.toFixed(2)}, endTime=${s.end.toFixed(2)}, text="${s.text}"`;
    }).join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a world-class cinematic video editor AI. Create an editing plan for this video.

VIDEO DURATION: ${videoDuration} seconds

TRANSCRIPTION SEGMENTS:
${segmentList}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.

=== CAPTION PLAN (YOU MUST FOLLOW THIS EXACTLY) ===
Create these EXACT captions with these EXACT timestamps. Do NOT change the timing or text:
${captionInstructions}

Each caption object must have this structure:
{
  "id": "cap_1",
  "startTime": <exact start from above>,
  "endTime": <exact end from above>,
  "text": "<exact text from above>",
  "style": {
    "fontFamily": "Inter",
    "fontSize": 48,
    "fontWeight": 800,
    "color": "#FFFFFF",
    "backgroundColor": "#000000",
    "backgroundOpacity": 0.5,
    "position": "bottom",
    "textAlign": "center",
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "shadowColor": "rgba(0,0,0,0.8)",
    "shadowBlur": 6
  },
  "animation": "karaoke",
  "emphasis": ["important", "words"]
}

CAPTION RULES:
- Captions MUST NEVER overlap. Each caption endTime must be <= next caption startTime.
- Keep max 6-8 words per caption. Split longer segments.
- "animation" should be "karaoke" for most captions (word-by-word highlight)
- Use "pop" for shocking/important statements, "bounce" for light moments
- "emphasis" should contain 1-2 of the most impactful words in that caption
- EVERY segment must have a caption. Do not skip any.

=== EFFECTS PLAN ===
Create effects that are synchronized with the speech segments. Each effect must use startTime/endTime from a specific segment.

Effect types and when to use them:
- "zoom-in": Start of important statements. params: { "scale": 1.2-1.4, "focusX": 0.5, "focusY": 0.35 }
- "zoom-out": End of topics/transition moments. params: { "scale": 1.2 }
- "zoom-pulse": Surprising/emphatic single words (0.3-0.8s duration). params: { "scale": 1.15 }
- "pan-left"/"pan-right": Topic transitions (1-2s). params: { "distance": 20 }
- "shake": Dramatic emphasis (0.3-0.5s max). params: { "intensity": 3, "frequency": 15 }
- "transition-fade": Between major topic changes (0.3-0.5s). params: { "duration": 0.4 }
- "transition-glitch": Shocking moments (0.2-0.4s). params: { "intensity": 5 }
- "vignette": Emotional/intimate moments. params: { "intensity": 0.3 }
- "letterbox": Cinematic moments. params: { "amount": 0.08 }
- "flash": Quick emphasis (0.1-0.2s). params: { "color": "#FFFFFF", "duration": 0.15 }
- "color-grade": Set mood for video sections. params: { "preset": "cinematic-warm" }

EFFECT RULES:
- Effects of the SAME TYPE must NOT overlap each other
- Different types CAN overlap (e.g., zoom-in + vignette simultaneously is OK)
- Add a zoom effect roughly every 3-6 seconds
- Effects should start/end at segment boundaries when possible
- Use 8-15 effects total for a dynamic feel
- Start with a zoom-in on the first segment
- Add transitions between major topic shifts

=== B-ROLL PLAN ===
Suggest 3-5 b-roll images at key moments.

{
  "id": "broll_1",
  "timestamp": <when to show it, must be within a segment>,
  "duration": 2.0,
  "prompt": "<detailed cinematic image description for AI generation>",
  "reason": "why this visual fits here"
}

B-ROLL RULES:
- Space evenly throughout the video
- timestamp must align with a speech moment that mentions the subject
- Duration: 1.5-2.5 seconds each
- Prompt must be vivid: include style (cinematic, editorial, close-up), lighting, mood

=== FULL JSON STRUCTURE ===
{
  "effects": [...],
  "bRollSuggestions": [...],
  "captions": [...],
  "overallMood": "intense" | "casual" | "dramatic" | "educational",
  "pacing": "slow" | "medium" | "fast" | "dynamic",
  "colorGrade": "cinematic-warm" | "cold-thriller" | "vintage" | "high-contrast"
}`,
            },
          ],
        },
      ],
    });

    const text = response?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const editPlan = JSON.parse(cleaned);

    return NextResponse.json(editPlan);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
