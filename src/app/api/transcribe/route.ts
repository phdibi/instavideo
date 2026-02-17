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

TIMESTAMP RULES (EXTREMELY IMPORTANT):
1. TIMING ACCURACY: Each word's start time must be the EXACT moment the speaker begins articulating that word. Each word's end time must be the EXACT moment the speaker finishes articulating that word. Accuracy must be within 50ms.
2. NO EARLY TIMESTAMPS: Never place a word's start time BEFORE the speaker actually starts saying it. If unsure, round the start time UP (later) by 50-100ms rather than placing it too early.
3. NO LATE TIMESTAMPS: Never place a word's end time AFTER the speaker finishes saying it plus 100ms.
4. WORD-LEVEL TIMESTAMPS ARE MANDATORY: Every single word MUST have its own start and end timestamp in the "words" array. This is critical for karaoke-style subtitle display.
5. NATURAL SEGMENTS: Group words into segments of 2-5 seconds at natural phrase/sentence boundaries. Shorter segments (2-3 seconds) are preferred.
6. NO OVERLAPS: Segments must never overlap. Words within a segment must not overlap.
7. NO ARTIFICIAL GAPS: If speech is continuous between segments, the next segment should start where the previous ended. Do not add padding.
8. SILENCE BOUNDARIES: Pauses longer than 0.4 seconds in speech should be segment boundaries.
9. MONOTONIC TIMESTAMPS: Word timestamps must be strictly increasing within each segment. Segment timestamps must be strictly increasing.
10. Detect language automatically. Transcribe in the original language. Keep natural punctuation.`,
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
