"use client";

import dynamic from "next/dynamic";
import { useProjectStore } from "@/store/useProjectStore";
import UploadScreen from "@/components/UploadScreen";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy-load heavy screens so their dependencies (FFmpeg, canvas, Web Audio)
// don't block initial page load or crash Safari before UploadScreen renders.
const ProcessingScreen = dynamic(() => import("@/components/ProcessingScreen"), {
  ssr: false,
  loading: () => <LoadingFallback />,
});
const EditorLayout = dynamic(() => import("@/components/EditorLayout"), {
  ssr: false,
  loading: () => <LoadingFallback />,
});
const TeleprompterScreen = dynamic(() => import("@/components/TeleprompterScreen"), {
  ssr: false,
  loading: () => <LoadingFallback />,
});

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function Home() {
  const { status } = useProjectStore();

  return (
    <ErrorBoundary>
      {status === "idle" ? (
        <UploadScreen />
      ) : status === "teleprompter" ? (
        <TeleprompterScreen />
      ) : status === "ready" || status === "exporting" ? (
        <EditorLayout />
      ) : (
        <ProcessingScreen />
      )}
    </ErrorBoundary>
  );
}
