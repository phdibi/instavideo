/** Font mapping: display name → CSS font-family value */

export interface FontOption {
  name: string;
  family: string; // CSS font-family value (from next/font CSS variable)
}

export const AVAILABLE_FONTS: FontOption[] = [
  { name: "Inter", family: "var(--font-inter), system-ui, sans-serif" },
  { name: "Montserrat", family: "var(--font-montserrat), system-ui, sans-serif" },
  { name: "Bebas Neue", family: "var(--font-bebas), system-ui, sans-serif" },
  { name: "Oswald", family: "var(--font-oswald), system-ui, sans-serif" },
  { name: "Poppins", family: "var(--font-poppins), system-ui, sans-serif" },
  { name: "Roboto", family: "var(--font-roboto), system-ui, sans-serif" },
  { name: "Anton", family: "var(--font-anton), system-ui, sans-serif" },
  { name: "Bangers", family: "var(--font-bangers), cursive" },
  { name: "Permanent Marker", family: "var(--font-marker), cursive" },
  { name: "Russo One", family: "var(--font-russo), system-ui, sans-serif" },
  { name: "Playfair Display", family: "var(--font-playfair), Georgia, serif" },
];

/** Get CSS font-family value by display name */
export function getFontValue(name: string): string {
  return AVAILABLE_FONTS.find((f) => f.name === name)?.family
    ?? "var(--font-inter), system-ui, sans-serif";
}

/**
 * Get raw font name for canvas rendering.
 * Canvas API needs the actual font-family name, not CSS variables.
 * Maps display names to their real CSS font-family names.
 */
const CANVAS_FONT_MAP: Record<string, string> = {
  "Inter": "Inter",
  "Montserrat": "Montserrat",
  "Bebas Neue": "'Bebas Neue'",
  "Oswald": "Oswald",
  "Poppins": "Poppins",
  "Roboto": "Roboto",
  "Anton": "Anton",
  "Bangers": "Bangers",
  "Permanent Marker": "'Permanent Marker'",
  "Russo One": "'Russo One'",
  "Playfair Display": "'Playfair Display'",
};

export function getCanvasFontName(name: string): string {
  return CANVAS_FONT_MAP[name] ?? "Inter";
}
