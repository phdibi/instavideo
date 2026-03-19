import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { checkRateLimit, getClientIP } from "@/lib/rateLimit";

const SegmentSchema = z.array(
  z.object({
    mode: z.enum(["presenter", "broll", "typography"]),
    startTime: z.number(),
    endTime: z.number(),
    brollQuery: z.string().optional(),
    brollPromptAI: z.string().optional(),
    typographyText: z.string().optional(),
    typographyBackground: z.enum(["#F5F0E8", "#0a0a0a"]).optional(),
    transcriptText: z.string().optional(),
  })
);

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = checkRateLimit(`analyze-modes:${ip}`, { limit: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Muitas análises. Aguarde um momento." }, { status: 429 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 500 }
      );
    }

    const { transcription, duration } = await request.json();

    if (!transcription || typeof transcription !== "string") {
      return NextResponse.json(
        { error: "Missing transcription" },
        { status: 400 }
      );
    }

    // Limit transcription length to prevent abuse
    const safeTranscription = transcription.slice(0, 20_000);

    const systemPrompt = `You are a cinematic video editor AI. You analyze video transcriptions and create compelling visual sequences for short-form vertical video content (Instagram Reels style).

There are 3 modes:
- "presenter" (Mode A): Shows the speaker on camera. Used when the person is making a point, telling a story, or engaging directly.
- "broll" (Mode B): Shows relevant B-roll video footage. Used to illustrate concepts, show examples, or add visual variety. Think of it as cinematic cutaways.
- "typography" (Mode C): Shows large text on screen with animated word reveals. Used for key phrases, statistics, or impactful statements. Text should be 2-6 words max, uppercase.

Rules:
1. ALWAYS start with "presenter" mode for the first 2-4 seconds (hook the viewer with the speaker)
2. Aim for roughly 25% presenter, 55% broll, 20% typography
3. B-ROLL SEQUENCES ARE ENCOURAGED: place 2-4 consecutive "broll" segments to form mini-documentary sequences with a visual arc (wide establishing shot → medium shot → close-up detail). These sequences create cinematic storytelling moments.
4. NEVER place two consecutive "typography" segments
5. Alternate naturally between modes to create dynamic pacing
6. Typography segments should be 2-3 seconds long
7. B-roll segments in a SEQUENCE should be 3-5 seconds each; STANDALONE b-roll segments can be 3-8 seconds
8. Presenter segments vary based on content (shorter = more dynamic feel)
9. Typography background should alternate between "#F5F0E8" (beige) and "#0a0a0a" (dark)

B-ROLL SEARCH & AI GENERATION (CRITICAL):

You must provide TWO fields for each b-roll segment:

1. "brollQuery" — SHORT search query (2-4 words in English) optimized for Pexels stock library.
   - Pexels has limited content. Use SIMPLE, CONCRETE terms that return real results.
   - GOOD: "business meeting office", "city skyline sunset", "coding laptop dark"
   - BAD: "close up hands typing on modern keyboard dark background cinematic" (too specific, no results)
   - Focus on the MAIN SUBJECT only. No adjectives about lighting/mood/camera.
   - Always in English regardless of video language.

2. "brollPromptAI" — DETAILED AI image generation prompt (30-80 words in English).
   - This is used when stock footage isn't good enough and AI generates the image.
   - Be EXTREMELY SPECIFIC about what should appear in the image.
   - Include: main subject, setting, lighting, mood, color palette, camera angle, depth of field.
   - Match the EXACT context of what the speaker is discussing at that moment.
   - ALWAYS include "portrait orientation, 9:16 aspect ratio" at the end.
   - Example: "A focused entrepreneur working on a sleek laptop in a modern minimalist office, warm ambient lighting from large windows, shallow depth of field with bokeh city lights in background, professional and aspirational mood, muted earth tones with warm highlights, eye-level camera angle, portrait orientation, 9:16 aspect ratio"

VISUAL STORYTELLING GUIDELINES:
- Create THEMATIC CONTINUITY between b-rolls: if the topic is about technology, use a connected visual narrative (e.g., "laptop coding" → "digital interface" → "team celebrating")
- B-ROLL SEQUENCES should follow a NARRATIVE ARC: WIDE/ESTABLISHING → MEDIUM/ACTION → CLOSE-UP/DETAIL
- Match the EMOTIONAL TONE of the transcript: dramatic → dark moody visuals, positive → bright dynamic visuals
- Think about what the viewer would EXPECT to see when hearing these specific words

Respond with a JSON array only, no other text. Each element must have:
{
  "mode": "presenter" | "broll" | "typography",
  "startTime": number (seconds),
  "endTime": number (seconds),
  "brollQuery": string (only for broll, 2-4 word English Pexels search query),
  "brollPromptAI": string (only for broll, detailed 30-80 word AI generation prompt),
  "typographyText": string (only for typography mode, original language),
  "typographyBackground": "#F5F0E8" | "#0a0a0a" (only for typography mode),
  "transcriptText": string (what is being said during this segment)
}`;

    const anthropic = getAnthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the transcription with timestamps. Video duration: ${duration} seconds.\n\n${safeTranscription}\n\nCreate the mode segments array as JSON.`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = textContent.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error("Failed to parse Claude response as JSON:", jsonText.slice(0, 500));
      return NextResponse.json(
        { error: "Resposta da IA não é JSON válido. Tente novamente." },
        { status: 500 }
      );
    }

    const result = SegmentSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Invalid segments schema from Claude:", result.error.issues);
      return NextResponse.json(
        { error: "Mode analysis returned invalid data" },
        { status: 500 }
      );
    }

    // Add IDs
    const validatedSegments = result.data.map((seg, i) => ({
      id: `mode-${i}`,
      mode: seg.mode,
      startTime: seg.startTime,
      endTime: seg.endTime,
      brollQuery: seg.brollQuery || undefined,
      brollPromptAI: seg.brollPromptAI || undefined,
      typographyText: seg.typographyText || undefined,
      typographyBackground: seg.typographyBackground || undefined,
      transcriptText: seg.transcriptText || undefined,
    }));

    return NextResponse.json({ segments: validatedSegments });
  } catch (error: unknown) {
    console.error("Mode analysis error:", error);
    let msg = "Mode analysis failed";
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) msg = "Anthropic API key inválida";
      else if (error.status === 429) msg = "Limite da API Anthropic atingido. Tente novamente.";
      else msg = `Anthropic error: ${error.message}`;
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
