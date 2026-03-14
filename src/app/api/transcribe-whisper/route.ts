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

    // Check file size (Whisper limit: 25MB)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: `Arquivo de áudio muito grande (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Limite: 25MB. Tente um vídeo mais curto.` },
        { status: 400 }
      );
    }

    console.log(`[Whisper] Transcribing audio: ${(audioFile.size / 1024 / 1024).toFixed(2)}MB`);

    const openai = getOpenAI();
    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    // The verbose_json response includes words and segments at the top level
    const typedResponse = response as unknown as {
      text: string;
      language?: string;
      words?: Array<{ word: string; start: number; end: number }>;
      segments?: Array<{ start: number; end: number; text: string }>;
    };

    const words = typedResponse.words || [];
    const segments = typedResponse.segments || [];

    console.log(`[Whisper] Got ${segments.length} segments, ${words.length} words`);

    const result: TranscriptionResult = {
      fullText: typedResponse.text || response.text,
      language: typedResponse.language || "pt",
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
  } catch (error: unknown) {
    console.error("Whisper transcription error:", error);

    // Extract useful error message from OpenAI SDK
    let message = "Transcription failed";
    if (error instanceof Error) {
      message = error.message;
    }
    if (error && typeof error === "object" && "status" in error) {
      const apiError = error as { status: number; message?: string };
      message = apiError.message || `OpenAI API error (HTTP ${apiError.status})`;
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
