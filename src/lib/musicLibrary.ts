import type { MusicTrack } from "@/types";

/**
 * Music library — royalty-free tracks stored in /public/music/
 * User should add MP3 files (128kbps, 2-5 min loops) to that directory.
 */
export const musicTracks: MusicTrack[] = [
  {
    id: "upbeat-corporate",
    name: "Upbeat Corporate",
    file: "/music/upbeat-corporate.mp3",
    duration: 180,
  },
  {
    id: "chill-ambient",
    name: "Chill Ambient",
    file: "/music/chill-ambient.mp3",
    duration: 240,
  },
  {
    id: "motivational",
    name: "Motivational",
    file: "/music/motivational.mp3",
    duration: 200,
  },
  {
    id: "tech-innovation",
    name: "Tech Innovation",
    file: "/music/tech-innovation.mp3",
    duration: 210,
  },
];

export function getTrackById(id: string): MusicTrack | undefined {
  return musicTracks.find((t) => t.id === id);
}

export function getRandomTrack(): MusicTrack {
  return musicTracks[Math.floor(Math.random() * musicTracks.length)];
}
