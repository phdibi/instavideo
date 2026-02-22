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
1. "hook" — First 3-5 seconds of the video. Goal: grab attention immediately. Large bold captions, dramatic zoom-in, no B-Roll.
2. "talking-head" — Standard continuous speech. Goal: maintain engagement. Dynamic captions with keyword highlighting, gentle zoom-pulse, no B-Roll.
3. "talking-head-broll" — Speech that mentions visual concepts (objects, places, actions, products, demonstrations). Goal: illustrate what's being said. Intercalate B-Roll images with talking head.
4. "futuristic-hud" — Abstract/conceptual content about technology, AI, science, future, data, code, systems. Goal: create tech visual impact. HUD overlay, cold color palette, tech B-Roll.

RULES:
- Segment 1 MUST be "hook" if it starts within the first 5 seconds
- Use "futuristic-hud" when 2+ tech/science keywords appear (AI, technology, neural, algorithm, code, data, system, future, digital, automation, etc.)
- Use "talking-head-broll" when the speaker mentions concrete visual concepts (objects, places, actions, demonstrations, products, examples, results)
- Use "talking-head" for general conversational speech
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
