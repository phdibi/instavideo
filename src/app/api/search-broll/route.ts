import { NextRequest, NextResponse } from "next/server";
import type { PexelsVideoResult } from "@/types";

interface PexelsFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string;
  video_files: PexelsFile[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Pexels API key not configured" }, { status: 500 });
    }

    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();

    const results: PexelsVideoResult[] = (data.videos || []).map(
      (video: PexelsVideo) => {
        // Prefer HD quality, portrait-ish aspect ratio
        const bestFile =
          video.video_files.find(
            (f: PexelsFile) => f.quality === "hd" && f.height > f.width
          ) ||
          video.video_files.find((f: PexelsFile) => f.quality === "hd") ||
          video.video_files[0];

        return {
          id: video.id,
          url: bestFile?.link || "",
          thumbnail: video.image,
          width: bestFile?.width || video.width,
          height: bestFile?.height || video.height,
          duration: video.duration,
        };
      }
    );

    return NextResponse.json({ videos: results });
  } catch (error) {
    console.error("Pexels search error:", error);
    return NextResponse.json(
      { error: "B-roll search failed" },
      { status: 500 }
    );
  }
}
