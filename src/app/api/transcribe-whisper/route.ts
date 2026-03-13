import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { TranscriptionResult } from "@/types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const openai = getOpenAI();
    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    const words = (response as unknown as { words?: Array<{ word: string; start: number; end: number }> }).words || [];
    const segments = (response as unknown as { segments?: Array<{ start: number; end: number; text: string }> }).segments || [];

    const result: TranscriptionResult = {
      fullText: response.text,
      language: (response as unknown as { language?: string }).language || "pt",
      segments: segments.map((seg) => {
        const segWords = words.filter(
          (w) => w.start >= seg.start && w.end <= seg.end + 0.1
        );
        return {
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
          confidence: 0.95,
          words: segWords.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: 0.95,
          })),
        };
      }),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Whisper transcription error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
