import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      console.error("[CineAI] GOOGLE_AI_API_KEY not configured or still set to placeholder");
      return NextResponse.json(
        { error: "API key not configured. Set GOOGLE_AI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const { prompt, style } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build enhanced prompt based on authority style
    let enhancedPrompt = prompt;
    if (style === "authority-teal") {
      enhancedPrompt = `Professional corporate setting, futuristic technology, clean modern aesthetic, teal and dark tones, executive consulting environment: ${prompt}`;
    } else if (style === "authority-amber") {
      enhancedPrompt = `Warm professional atmosphere, psychology and neuroscience aesthetic, amber warm lighting, sophisticated consulting environment: ${prompt}`;
    } else if (style === "authority-blended") {
      enhancedPrompt = `Professional consulting environment, blend of technology and human connection, modern and warm tones, executive setting: ${prompt}`;
    }

    console.log(`[CineAI] Generating B-roll: "${enhancedPrompt.slice(0, 80)}..."`);

    const fullPrompt = `Cinematic, high quality, 16:9 aspect ratio, professional photography style: ${enhancedPrompt}`;

    // Try Imagen 4 first, fall back to Imagen 3 if unavailable
    const MODELS = [
      "imagen-4.0-generate-001",
      "imagen-3.0-generate-002",
      "imagen-3.0-fast-generate-001",
    ];

    let lastError: string = "";
    for (const model of MODELS) {
      try {
        console.log(`[CineAI] Trying model: ${model}`);
        const response = await ai.models.generateImages({
          model,
          prompt: fullPrompt,
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

            console.log(`[CineAI] B-roll generated successfully with ${model} (${Math.round(base64.length / 1024)}KB)`);
            return NextResponse.json({
              imageUrl: `data:image/png;base64,${base64}`,
            });
          }
          lastError = `${model}: response had no imageBytes`;
          console.warn(`[CineAI] ${lastError}`);
        } else {
          lastError = `${model}: no generatedImages in response`;
          console.warn(`[CineAI] ${lastError}:`, JSON.stringify(response).slice(0, 200));
        }
      } catch (modelErr) {
        const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        lastError = `${model}: ${errMsg}`;
        console.warn(`[CineAI] Model ${model} failed:`, errMsg);
        // If it's a quota/rate limit error, don't try other models — the issue is account-level
        if (errMsg.includes("429") || errMsg.includes("quota")) {
          break;
        }
        // Otherwise try the next model
        continue;
      }
    }

    console.error(`[CineAI] All Imagen models failed. Last error: ${lastError}`);
    return NextResponse.json(
      { error: `B-roll generation failed across all models. Last error: ${lastError}` },
      { status: 500 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[CineAI] B-roll generation error:", errorMessage);

    // Provide specific guidance for common errors
    if (errorMessage.includes("quota") || errorMessage.includes("429")) {
      return NextResponse.json(
        { error: "API quota exceeded. Wait a moment and try again." },
        { status: 429 }
      );
    }
    if (errorMessage.includes("permission") || errorMessage.includes("403")) {
      return NextResponse.json(
        { error: "API permission denied. Ensure Imagen API is enabled in your Google Cloud project." },
        { status: 403 }
      );
    }
    if (errorMessage.includes("not found") || errorMessage.includes("404")) {
      return NextResponse.json(
        { error: "Imagen model not available. Ensure imagen-4.0-generate-001 is accessible with your API key." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: `B-roll generation failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
