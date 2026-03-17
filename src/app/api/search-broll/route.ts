import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import type { PexelsVideoResult, PexelsPhotoResult } from "@/types";

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

interface PexelsPhotoSrc {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  small: string;
  portrait: string;
  landscape: string;
  tiny: string;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  src: PexelsPhotoSrc;
}

export async function GET(request: NextRequest) {
  try {
    const rl = checkRateLimit("search-broll", { limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Muitas buscas. Aguarde um momento." }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.slice(0, 200);

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Pexels API key not configured" }, { status: 500 });
    }

    // Fetch videos and photos in parallel
    const [videosResponse, photosResponse] = await Promise.all([
      fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6&orientation=portrait`,
        { headers: { Authorization: apiKey } }
      ),
      fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6&orientation=portrait`,
        { headers: { Authorization: apiKey } }
      ),
    ]);

    if (!videosResponse.ok) {
      throw new Error(`Pexels Videos API error: ${videosResponse.status}`);
    }

    const videosData = await videosResponse.json();
    const videos: PexelsVideoResult[] = (videosData.videos || []).map(
      (video: PexelsVideo) => {
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

    let photos: PexelsPhotoResult[] = [];
    if (photosResponse.ok) {
      const photosData = await photosResponse.json();
      photos = (photosData.photos || []).map((photo: PexelsPhoto) => ({
        id: photo.id,
        url: photo.src.portrait,
        thumbnail: photo.src.medium,
        width: photo.width,
        height: photo.height,
      }));
    } else {
      console.warn(`Pexels Photos API error: ${photosResponse.status} (videos still returned)`);
    }

    return NextResponse.json({ videos, photos });
  } catch (error) {
    console.error("Pexels search error:", error);
    return NextResponse.json(
      { error: "B-roll search failed" },
      { status: 500 }
    );
  }
}
