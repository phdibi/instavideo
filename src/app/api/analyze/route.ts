import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const { transcription, videoDuration } = await request.json();

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a world-class cinematic video editor AI. Analyze this transcription from a video and create a complete editing plan.

VIDEO DURATION: ${videoDuration} seconds
TRANSCRIPTION:
${JSON.stringify(transcription, null, 2)}

Your job is to create a CINEMATIC, SUSPENSEFUL, ENGAGING edit plan that transforms a raw talking-head video into viral social media content.

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.

Return this exact JSON structure:
{
  "effects": [
    {
      "id": "effect_1",
      "type": "zoom-in",
      "startTime": 0.0,
      "endTime": 2.0,
      "params": {
        "scale": 1.3,
        "focusX": 0.5,
        "focusY": 0.4,
        "easing": "ease-out"
      }
    }
  ],
  "bRollSuggestions": [
    {
      "id": "broll_1",
      "timestamp": 5.0,
      "duration": 2.0,
      "prompt": "description for image generation",
      "reason": "why this b-roll fits here"
    }
  ],
  "captions": [
    {
      "id": "cap_1",
      "startTime": 0.0,
      "endTime": 2.5,
      "text": "caption text",
      "style": {
        "fontFamily": "Inter",
        "fontSize": 48,
        "fontWeight": 800,
        "color": "#FFFFFF",
        "backgroundColor": "#000000",
        "backgroundOpacity": 0.6,
        "position": "bottom",
        "textAlign": "center",
        "strokeColor": "#000000",
        "strokeWidth": 2,
        "shadowColor": "rgba(0,0,0,0.5)",
        "shadowBlur": 4
      },
      "animation": "pop",
      "emphasis": ["key", "words"]
    }
  ],
  "overallMood": "intense",
  "pacing": "dynamic",
  "colorGrade": "cinematic-warm"
}

EDITING RULES - Follow these like a professional video editor:

1. ZOOM EFFECTS:
   - Use "zoom-in" on key emotional moments, important statements, dramatic reveals
   - Use "zoom-out" for transitions between topics or to create breathing room
   - Use "zoom-pulse" (quick zoom in then out) for emphasis on surprising words
   - Scale range: 1.1 (subtle) to 1.5 (dramatic)
   - Focus on the face area (focusY: 0.3-0.5)
   - Add zooms every 3-8 seconds for dynamic feel

2. PAN/MOVEMENT EFFECTS:
   - Use "pan-left", "pan-right" during topic transitions
   - Use "shake" for dramatic emphasis (short duration, 0.3-0.5s)
   - Pan params: { "distance": 30, "easing": "ease-in-out" }
   - Shake params: { "intensity": 3, "frequency": 15 }

3. TRANSITIONS:
   - Use "transition-fade" between major topic changes
   - Use "transition-glitch" for surprising/shocking moments
   - Use "transition-zoom" for building intensity
   - Transition params: { "duration": 0.5 }

4. VISUAL EFFECTS:
   - Use "letterbox" during cinematic/serious moments: { "amount": 0.1 }
   - Use "vignette" for intimate/emotional moments: { "intensity": 0.3 }
   - Use "flash" for emphasis: { "color": "#FFFFFF", "duration": 0.15 }
   - Use "blur-background" for focus: { "amount": 5 }
   - Use "color-grade" for mood: { "preset": "cinematic-warm" | "cold-thriller" | "vintage" | "high-contrast" }

5. SPEED EFFECTS:
   - Use "slow-motion" for dramatic pauses: { "speed": 0.5 }
   - Use "speed-ramp" for dynamic pacing: { "startSpeed": 1.0, "endSpeed": 1.5 }

6. B-ROLL:
   - Suggest 2-5 b-roll images at key moments where visual support enhances the message
   - Each prompt should be a detailed image description suitable for Imagen 3
   - B-roll should appear when the speaker mentions specific things, concepts, or during transition moments
   - Duration: 1.5-3 seconds each

7. CAPTIONS:
   - Create captions from the transcription segments
   - Use different animation styles based on content:
     * "pop" for emphasis/important points
     * "typewriter" for storytelling/narrative moments
     * "karaoke" for energetic/fast sections
     * "highlight-word" for key terms
     * "bounce" for fun/casual moments
     * "fade" for serious/emotional moments
   - Mark emphasis words (the most important 1-3 words per caption)
   - Style should match the mood of the content

8. PACING:
   - Analyze speech speed and energy to determine pacing
   - Fast speech = more cuts, more zooms, "fast" or "dynamic" pacing
   - Slow/deliberate speech = fewer effects, more breathing room, "slow" pacing
   - Mixed = "dynamic" pacing with variety

Make the edit feel like a PROFESSIONAL social media video with HIGH RETENTION editing.
The goal is CINEMATIC SUSPENSE and ENGAGEMENT.`,
            },
          ],
        },
      ],
    });

    const text = response?.text || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const editPlan = JSON.parse(cleaned);

    return NextResponse.json(editPlan);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
