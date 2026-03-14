import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const { transcription, duration } = await request.json();

    if (!transcription) {
      return NextResponse.json(
        { error: "Missing transcription" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a video editor AI. You analyze video transcriptions and create a sequence of visual mode segments for short-form vertical video content.

There are 3 modes:
- "presenter" (Mode A): Shows the speaker on camera. Used when the person is making a point, telling a story, or engaging directly.
- "broll" (Mode B): Shows relevant B-roll video footage fullscreen. Used to illustrate concepts, show examples, or add visual variety.
- "typography" (Mode C): Shows large text on screen with animated word reveals. Used for key phrases, statistics, or impactful statements. Text should be 2-6 words max, uppercase.

Rules:
1. ALWAYS start with "presenter" mode
2. Aim for roughly 40% presenter, 40% broll, 20% typography
3. NEVER place two consecutive "broll" segments
4. NEVER place two consecutive "typography" segments
5. Alternate naturally between modes
6. Typography segments should be 2-3 seconds long
7. B-roll segments should be 3-8 seconds long
8. Presenter segments vary based on content
9. For broll segments, provide a specific search query in English for finding stock video (e.g., "person typing on laptop", "city skyline at night")
10. For typography segments, extract the key phrase being said (2-6 words, in the original language)
11. Typography background should alternate between "#F5F0E8" (beige) and "#0a0a0a" (dark)

Respond with a JSON array only, no other text. Each element must have:
{
  "mode": "presenter" | "broll" | "typography",
  "startTime": number (seconds),
  "endTime": number (seconds),
  "brollQuery": string (only for broll mode, English search query),
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
          content: `Here is the transcription with timestamps. Video duration: ${duration} seconds.\n\n${transcription}\n\nCreate the mode segments array as JSON.`,
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

    const segments = JSON.parse(jsonText);

    // Validate and add IDs
    const validatedSegments = segments.map(
      (
        seg: {
          mode: string;
          startTime: number;
          endTime: number;
          brollQuery?: string;
          typographyText?: string;
          typographyBackground?: string;
          transcriptText?: string;
        },
        i: number
      ) => ({
        id: `mode-${i}`,
        mode: seg.mode,
        startTime: seg.startTime,
        endTime: seg.endTime,
        brollQuery: seg.brollQuery || undefined,
        typographyText: seg.typographyText || undefined,
        typographyBackground: seg.typographyBackground || undefined,
        transcriptText: seg.transcriptText || undefined,
      })
    );

    return NextResponse.json({ segments: validatedSegments });
  } catch (error: unknown) {
    console.error("Mode analysis error:", error);
    let message = "Mode analysis failed";
    if (error instanceof Error) message = error.message;
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
