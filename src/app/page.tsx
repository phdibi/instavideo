"use client";

import { useProjectStore } from "@/store/useProjectStore";
import UploadScreen from "@/components/UploadScreen";
import ProcessingScreen from "@/components/ProcessingScreen";
import EditorLayout from "@/components/EditorLayout";
import TeleprompterScreen from "@/components/TeleprompterScreen";
import ErrorBoundary from "@/components/ErrorBoundary";

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
