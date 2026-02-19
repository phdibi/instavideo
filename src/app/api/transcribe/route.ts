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
              text: `You are a professional audio transcription engine specialized in Brazilian Portuguese (PT-BR). Your job is to produce perfectly synchronized word-level timestamps for subtitle generation.

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

TIMESTAMP RULES (CRITICAL — each word will be displayed as an individual subtitle):

1. TIMING PRECISION: Each word's start time = EXACT moment the speaker begins articulating it. Each word's end time = EXACT moment they finish. Target 30ms accuracy. This is the MOST important requirement.

2. LISTEN CAREFULLY TO SPEECH ONSET: The most common error is placing timestamps TOO EARLY. The word start time must be when the speaker's mouth actually produces the first sound of the word. If in doubt, bias 50ms LATE rather than early. Early subtitles look broken.

3. PORTUGUESE WORD DURATIONS (sanity check):
   - Single-syllable: "eu", "que", "de", "é", "não" → 100-250ms
   - Two-syllable: "fala", "isso", "como", "muito" → 200-400ms
   - Three-syllable: "machine", "exemplo", "trabalho" → 300-500ms
   - Four+ syllable: "inteligência", "tecnologia" → 400-800ms
   If a word timestamp implies duration > 1s, it's likely wrong.

4. WORD GAPS: Brazilian Portuguese speech has natural micro-gaps between words (30-100ms). Preserve these faithfully. Do NOT make words overlap. Do NOT make word end = next word start unless they were genuinely spoken without pause.

5. RESPECT SILENCE: If the speaker pauses (even 200ms), the gap MUST appear in timestamps. Do NOT invent timestamps to fill silence. Silence is meaningful for subtitle pacing.

6. SEGMENT BOUNDARIES: Split at natural pauses > 300ms. Keep segments short (3-6 words max). Each segment MUST contain word-level timestamps.

7. MONOTONIC & NON-OVERLAPPING: All timestamps strictly increasing. No word/segment overlaps.

8. EVERY WORD: Every single spoken word MUST have its own start/end timestamp. This includes filler words like "é", "né", "tipo", "então", "bom".

9. SELF-CHECK: Before returning, verify:
   a) First word doesn't start at 0.0 unless speaker truly starts immediately
   b) No word has duration > 1.2s (likely a merge error)
   c) No word has duration < 50ms (likely missing)
   d) Total transcription time roughly matches audio length

10. Detect language automatically. Transcribe in original language. Keep natural punctuation.`,
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
