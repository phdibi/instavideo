"use client";

import { useProjectStore } from "@/store/useProjectStore";
import UploadScreen from "@/components/UploadScreen";
import ProcessingScreen from "@/components/ProcessingScreen";
import EditorLayout from "@/components/EditorLayout";
import TeleprompterScreen from "@/components/TeleprompterScreen";

export default function Home() {
  const { status } = useProjectStore();

  if (status === "idle") {
    return <UploadScreen />;
  }

  if (status === "teleprompter") {
    return <TeleprompterScreen />;
  }

  if (status === "ready" || status === "exporting") {
    return <EditorLayout />;
  }

  // All processing states
  return <ProcessingScreen />;
}
