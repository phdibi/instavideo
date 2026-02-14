"use client";

import { useProjectStore } from "@/store/useProjectStore";
import UploadScreen from "@/components/UploadScreen";
import ProcessingScreen from "@/components/ProcessingScreen";
import EditorLayout from "@/components/EditorLayout";

export default function Home() {
  const { status } = useProjectStore();

  if (status === "idle") {
    return <UploadScreen />;
  }

  if (status === "ready" || status === "exporting") {
    return <EditorLayout />;
  }

  // All processing states
  return <ProcessingScreen />;
}
