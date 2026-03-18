import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Montserrat,
  Bebas_Neue,
  Oswald,
  Poppins,
  Roboto,
  Anton,
  Bangers,
  Permanent_Marker,
  Russo_One,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const bangers = Bangers({
  variable: "--font-bangers",
  subsets: ["latin"],
  weight: "400",
});

const permanentMarker = Permanent_Marker({
  variable: "--font-marker",
  subsets: ["latin"],
  weight: "400",
});

const russoOne = Russo_One({
  variable: "--font-russo",
  subsets: ["latin"],
  weight: "400",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "CineAI — AI Video Editor",
  description:
    "Transform your raw videos into cinematic social media content with AI-powered editing, captions, effects, and B-roll.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = [
    geistSans.variable,
    geistMono.variable,
    inter.variable,
    montserrat.variable,
    bebasNeue.variable,
    oswald.variable,
    poppins.variable,
    roboto.variable,
    anton.variable,
    bangers.variable,
    permanentMarker.variable,
    russoOne.variable,
    playfairDisplay.variable,
  ].join(" ");

  return (
    <html lang="pt-BR">
      <body className={`${fontVars} antialiased`}>
        {children}
      </body>
    </html>
  );
}
