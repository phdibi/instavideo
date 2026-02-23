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

    const { transcription, videoDuration, contentPillar } = await request.json();

    const ai = new GoogleGenAI({ apiKey });

    const segments = transcription.segments || [];
    const segmentList = segments
      .map(
        (s: { start: number; end: number; text: string }, i: number) =>
          `[${i + 1}] ${s.start.toFixed(2)}s-${s.end.toFixed(2)}s: "${s.text}"`
      )
      .join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a professional video editor AI that analyzes speech segments and assigns editing presets.
${contentPillar && contentPillar !== "quick-tips" ? `
CONTENT CONTEXT: This video is from an AI consultant with a psychology/neuroscience background. The content pillar is "${contentPillar}".
- "ia-tech": Focus on AI, automation, chatbots, business consulting technology
- "psych-neuro": Focus on psychology, neuroscience, human behavior, cognitive biases
- "intersection": Blend of AI technology and human behavior/psychology
- "cases": Business case studies, results, ROI, transformations
When assigning "futuristic-hud", consider AI consulting keywords (automation, chatbot, workflow, pipeline, implementation, diagnostic).
When generating brollQuery, use professional consulting imagery that reinforces authority.
` : ""}
VIDEO: ${videoDuration.toFixed(1)}s total duration.

SPEECH SEGMENTS:
${segmentList}

AVAILABLE PRESETS:
1. "hook" — ONLY the first segment (first 3-5 seconds). Goal: confident opening. Clean zoom-in, no B-Roll.
2. "talking-head" — EXTREMELY RARE. Only for segments shorter than 1.5 seconds that are purely transitional filler. Almost never used.
3. "talking-head-broll" — DEFAULT for 80-90% of segments. Goal: illustrate what's being said with cinematic B-Roll. Use this for ANY segment longer than 1.5 seconds.
4. "futuristic-hud" — Abstract/conceptual content about technology, AI, science, data, code, systems. Goal: tech visual impact. HUD overlay, cold color palette, tech B-Roll.

STYLE: The editing should feel calm, elegant, and conversational — like a professional consultant speaking confidently. Avoid excessive variety. Prefer "talking-head-broll" over "talking-head" for visual richness.

RULES:
- Segment 1 MUST be "hook" if it starts within the first 5 seconds. NO other segment should be "hook".
- Use "futuristic-hud" when 2+ tech/science keywords appear (AI, technology, neural, algorithm, code, data, system, future, digital, automation, etc.)
- Use "talking-head-broll" as the DEFAULT for 80-90% of all segments — this is the preferred preset for professional content
- Use "talking-head" EXTREMELY RARELY — only for segments shorter than 1.5s that are purely filler/transitional. In most videos, 0-2 segments should be "talking-head"
- Extract the SINGLE most important keyword from each segment text (the word that should be visually highlighted)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "segments": [
    {
      "index": 0,
      "preset": "hook",
      "keywordHighlight": "most_important_word",
      "brollQuery": "cinematic image description for B-Roll (only for talking-head-broll and futuristic-hud)",
      "confidence": 0.95
    }
  ]
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

    const result = JSON.parse(cleaned);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Segment preset analysis error:", error);
    return NextResponse.json(
      {
        error:
          "Segment analysis failed: " +
          (error instanceof Error ? error.message : "Unknown error"),
      },
      { status: 500 }
    );
  }
}
