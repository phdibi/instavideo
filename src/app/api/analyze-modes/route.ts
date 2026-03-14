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

    const systemPrompt = `You are a cinematic video editor AI. You analyze video transcriptions and create compelling visual sequences for short-form vertical video content (Instagram Reels style).

There are 3 modes:
- "presenter" (Mode A): Shows the speaker on camera. Used when the person is making a point, telling a story, or engaging directly.
- "broll" (Mode B): Shows relevant B-roll video footage. Used to illustrate concepts, show examples, or add visual variety. Think of it as cinematic cutaways.
- "typography" (Mode C): Shows large text on screen with animated word reveals. Used for key phrases, statistics, or impactful statements. Text should be 2-6 words max, uppercase.

Rules:
1. ALWAYS start with "presenter" mode for the first 2-4 seconds (hook the viewer with the speaker)
2. Aim for roughly 35% presenter, 45% broll, 20% typography
3. NEVER place two consecutive "broll" segments — always insert presenter or typography between
4. NEVER place two consecutive "typography" segments
5. Alternate naturally between modes to create dynamic pacing
6. Typography segments should be 2-3 seconds long
7. B-roll segments should be 3-8 seconds long
8. Presenter segments vary based on content (shorter = more dynamic feel)
9. Typography background should alternate between "#F5F0E8" (beige) and "#0a0a0a" (dark)

B-ROLL CINEMATOGRAPHY GUIDELINES (CRITICAL):
- B-roll queries must be SPECIFIC and CINEMATIC. Use detailed search terms like "close up hands typing on modern keyboard dark background", "aerial drone shot of modern city at sunset", "slow motion brain neural network visualization"
- Create THEMATIC CONTINUITY between b-rolls: if the topic is about technology, use a connected visual narrative (e.g., "person working on laptop" → later "futuristic digital interface" → later "team celebrating in modern office")
- Use VARIED SHOT TYPES: mix close-ups, wide shots, aerial shots, detail shots, and abstract visuals
- Match the EMOTIONAL TONE: dramatic topic → dramatic visuals (dark backgrounds, slow motion), positive topic → bright and dynamic visuals
- Include CINEMATIC DETAILS in queries: mention lighting (e.g., "golden hour", "dramatic lighting", "neon lights"), camera movement (e.g., "slow motion", "tracking shot"), and atmosphere (e.g., "moody", "professional", "futuristic")
- Each b-roll query should be 5-12 words for specificity

Respond with a JSON array only, no other text. Each element must have:
{
  "mode": "presenter" | "broll" | "typography",
  "startTime": number (seconds),
  "endTime": number (seconds),
  "brollQuery": string (only for broll mode, detailed English search query with cinematic specificity),
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
