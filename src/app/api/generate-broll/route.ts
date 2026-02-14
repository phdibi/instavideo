import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt: `Cinematic, high quality, 16:9 aspect ratio, professional photography style: ${prompt}`,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9",
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const imageData = response.generatedImages[0].image;
      if (imageData?.imageBytes) {
        const base64 =
          typeof imageData.imageBytes === "string"
            ? imageData.imageBytes
            : Buffer.from(imageData.imageBytes).toString("base64");

        return NextResponse.json({
          imageUrl: `data:image/png;base64,${base64}`,
        });
      }
    }

    return NextResponse.json({ error: "No image generated" }, { status: 500 });
  } catch (error) {
    console.error("B-roll generation error:", error);
    return NextResponse.json(
      {
        error:
          "B-roll generation failed: " +
          (error instanceof Error ? error.message : "Unknown error"),
      },
      { status: 500 }
    );
  }
}
