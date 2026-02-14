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
              text: `You are a professional transcription engine. Transcribe the audio with precise timestamps.

CRITICAL: Return ONLY valid JSON, no markdown, no code blocks, no explanations.

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

Rules:
- Segment audio into natural sentence/phrase boundaries (2-6 seconds each)
- Include word-level timestamps when possible
- Detect language automatically
- Be precise with timestamps - every segment must have start/end times
- Keep text natural, include punctuation
- If the audio is in Portuguese, transcribe in Portuguese`,
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
