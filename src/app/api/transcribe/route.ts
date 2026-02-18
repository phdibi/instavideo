import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      return NextResponse.json(
        { error: "API key not configured. Set GOOGLE_AI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const audioBytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(audioBytes).toString("base64");

    const mimeType = audioFile.type || "audio/wav";

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: `You are a professional audio transcription engine. Your job is to produce perfectly synchronized subtitles with frame-accurate timing.

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.

Return this exact JSON structure:
{
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "transcribed text here",
      "confidence": 0.95,
      "words": [
        {"word": "transcribed", "start": 0.0, "end": 0.5, "confidence": 0.95},
        {"word": "text", "start": 0.6, "end": 0.9, "confidence": 0.96},
        {"word": "here", "start": 1.0, "end": 1.2, "confidence": 0.97}
      ]
    }
  ],
  "fullText": "complete transcription of all audio",
  "language": "pt-BR"
}

TIMESTAMP RULES (EXTREMELY IMPORTANT — subtitle sync depends on this):
1. TIMING ACCURACY: Each word's start time must be the EXACT moment the speaker begins articulating that word. Each word's end time must be the EXACT moment the speaker finishes. Aim for 50ms accuracy.
2. NO EARLY TIMESTAMPS: This is the most common error. NEVER place a word's start time BEFORE the speaker actually begins saying it. It is always better to be 100ms LATE than 100ms early. Early timestamps cause subtitles to appear before the speaker talks, which looks broken.
3. WORD DURATION: Most spoken words last between 200ms and 800ms. A single syllable word like "eu" or "que" is ~150-300ms. Multi-syllable words like "importante" are ~400-700ms. Use these as sanity checks.
4. WORD-LEVEL TIMESTAMPS ARE MANDATORY: Every single word MUST have its own start and end timestamp. This drives karaoke-style display where each word lights up as spoken.
5. RESPECT SILENCE: Do NOT smooth over silences. If the speaker pauses for 0.5s, there MUST be a 0.5s gap between the end of the last word and the start of the next. DO NOT hallucinate timestamps to fill gaps.
6. SEGMENT BOUNDARIES: Split at natural phrase/sentence boundaries or SILENCES > 0.4s. Shorter is better — 3-5 words per segment.
7. NO OVERLAPS: Segments and words must never overlap.
8. GAPS BETWEEN WORDS: Leave the natural gap between words as heard. If two words are spoken with no pause, the second word's start should equal (or be very close to) the first word's end.
9. MONOTONIC: All timestamps must be strictly increasing.
10. Detect language automatically. Transcribe in the original language. Keep natural punctuation.
11. SELF-CHECK: Before returning, mentally verify that the first word's timestamp matches when you actually hear it in the audio. A common mistake is starting timestamps at 0.0 when the speaker doesn't start until 0.5s or later.`,
            },
          ],
        },
      ],
    });

    const text = response?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const transcription = JSON.parse(cleaned);

    return NextResponse.json(transcription);
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Transcription failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
