import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { checkRateLimit, getClientIP } from "@/lib/rateLimit";
import type { TranscriptionResult } from "@/types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = checkRateLimit(`transcribe:${ip}`, { limit: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Muitas transcrições. Aguarde um momento." }, { status: 429 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Validate MIME type
    const allowedAudioTypes = [
      "audio/wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/ogg",
      "audio/webm", "audio/flac", "audio/x-m4a", "video/mp4", "video/webm",
    ];
    if (audioFile.type && !allowedAudioTypes.some((t) => audioFile.type.startsWith(t))) {
      return NextResponse.json(
        { error: "Tipo de arquivo não suportado. Envie áudio ou vídeo." },
        { status: 400 }
      );
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
    let msg = "Transcription failed";
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) msg = "OpenAI API key inválida";
      else if (error.status === 429) msg = "Limite da API OpenAI atingido. Tente novamente em alguns minutos.";
      else if (error.status === 413) msg = "Arquivo de áudio muito grande para a API";
      else msg = `OpenAI error: ${error.message}`;
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
