import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
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
    const createRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            prompt: `${prompt}, high quality, professional photography, portrait orientation`,
            aspect_ratio: "9:16",
            num_outputs: 1,
          },
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      console.error("Replicate create error:", createRes.status, err);
      throw new Error(`Replicate API error: ${createRes.status}`);
    }

    const prediction = await createRes.json();
    let result = prediction;

    // Poll until complete (max ~30s)
    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    for (let i = 0; i < 30; i++) {
      if (result.status === "succeeded") break;
      if (result.status === "failed" || result.status === "canceled") {
        throw new Error(`Image generation ${result.status}: ${result.error || "unknown"}`);
      }

      await new Promise((r) => setTimeout(r, 1000));

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
    console.error("Generate image error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
