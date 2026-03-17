import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit("generate-image", { limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Muitas requisições. Aguarde um momento." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Replicate API token not configured" },
        { status: 500 }
      );
    }

    // Create prediction with Flux Schnell (fast, cheap)
    const trimmedPrompt = prompt.slice(0, 500);
    const createRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            prompt: `${trimmedPrompt}, high quality, professional photography, portrait orientation`,
            aspect_ratio: "9:16",
            num_outputs: 1,
          },
        }),
      }
    );

    if (!createRes.ok) {
      const status = createRes.status;
      const err = await createRes.text().catch(() => "");
      console.error("Replicate create error:", status, err);
      if (status === 401 || status === 403) {
        return NextResponse.json({ error: "Replicate API key inválida ou sem permissão" }, { status: 500 });
      }
      if (status === 429) {
        return NextResponse.json({ error: "Limite da API Replicate atingido. Tente novamente em alguns minutos." }, { status: 429 });
      }
      throw new Error(`Replicate API error: ${status}`);
    }

    const prediction = await createRes.json();
    let result = prediction;

    // Poll until complete with exponential backoff (max ~30s)
    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    let delay = 500;
    for (let i = 0; i < 20; i++) {
      if (result.status === "succeeded") break;
      if (result.status === "failed" || result.status === "canceled") {
        throw new Error(`Image generation ${result.status}: ${result.error || "unknown"}`);
      }

      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 3000); // exponential backoff, cap at 3s

      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pollRes.ok) throw new Error(`Poll failed: ${pollRes.status}`);
      result = await pollRes.json();
    }

    if (result.status !== "succeeded" || !result.output?.[0]) {
      throw new Error("Image generation timed out");
    }

    const imageUrl = result.output[0];

    return NextResponse.json({ url: imageUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Image generation failed";
    console.error("Generate image error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
