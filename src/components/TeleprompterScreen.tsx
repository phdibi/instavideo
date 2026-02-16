"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Settings,
  Type,
  Video,
  FlipHorizontal,
  Timer,
  Eye,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Camera,
  CameraOff,
  GripHorizontal,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectStore } from "@/store/useProjectStore";

type TeleprompterPhase = "setup" | "countdown" | "recording" | "preview";

export default function TeleprompterScreen() {
  const {
    teleprompterSettings,
    setTeleprompterSettings,
    setVideoFile,
    setVideoUrl,
    setVideoDuration,
    setStatus,
  } = useProjectStore();

  const [phase, setPhase] = useState<TeleprompterPhase>("setup");
  const [countdownValue, setCountdownValue] = useState(3);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>(
    []
  );
  // Mobile bottom sheet state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true);
  const [mobileSheetHeight, setMobileSheetHeight] = useState(45); // percentage of screen

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const scrollPositionRef = useRef(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const sheetDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Initialize camera
  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setAvailableDevices(videoDevices);
      if (!deviceId && videoDevices.length > 0) {
        setSelectedDevice(videoDevices[0].deviceId);
      }

      setCameraReady(true);
      setCameraError("");
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Não foi possível acessar a câmera. Verifique as permissões.");
      setCameraReady(false);
    }
  }, []);

  const switchCamera = useCallback(
    (deviceId: string) => {
      setSelectedDevice(deviceId);
      startCamera(deviceId);
    },
    [startCamera]
  );

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera]);

  // Scroll animation loop
  const startScrolling = useCallback(() => {
    if (!scrollContainerRef.current) return;
    setIsScrolling(true);

    const container = scrollContainerRef.current;
    const pixelsPerFrame = teleprompterSettings.scrollSpeed * 0.5;

    const animate = () => {
      scrollPositionRef.current += pixelsPerFrame;
      container.scrollTop = scrollPositionRef.current;

      if (scrollPositionRef.current >= container.scrollHeight - container.clientHeight) {
        setIsScrolling(false);
        return;
      }

      scrollAnimRef.current = requestAnimationFrame(animate);
    };

    scrollAnimRef.current = requestAnimationFrame(animate);
  }, [teleprompterSettings.scrollSpeed]);

  const pauseScrolling = useCallback(() => {
    setIsScrolling(false);
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
  }, []);

  const resetScroll = useCallback(() => {
    pauseScrolling();
    scrollPositionRef.current = 0;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [pauseScrolling]);

  const startTimer = useCallback(() => {
    setElapsedTime(0);
    timerRef.current = window.setInterval(() => {
      setElapsedTime((t) => t + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    // Close mobile sheet during recording
    setMobileSheetOpen(false);

    setPhase("countdown");
    setCountdownValue(teleprompterSettings.countdownSeconds);

    let count = teleprompterSettings.countdownSeconds;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdownValue(count);

      if (count <= 0) {
        clearInterval(countdownInterval);
        setPhase("recording");

        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm";

        const recorder = new MediaRecorder(streamRef.current!, {
          mimeType,
          videoBitsPerSecond: 5_000_000,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setRecordedBlob(blob);
          setRecordedUrl(url);
          setPhase("preview");
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000);

        resetScroll();
        setTimeout(() => {
          startScrolling();
        }, 300);
        startTimer();
      }
    }, 1000);
  }, [teleprompterSettings.countdownSeconds, resetScroll, startScrolling, startTimer]);

  const stopRecording = useCallback(() => {
    pauseScrolling();
    stopTimer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, [pauseScrolling, stopTimer]);

  const toggleScroll = useCallback(() => {
    if (isScrolling) {
      pauseScrolling();
    } else {
      startScrolling();
    }
  }, [isScrolling, pauseScrolling, startScrolling]);

  const useRecording = useCallback(() => {
    if (!recordedBlob) return;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const file = new File([recordedBlob], "teleprompter-recording.webm", {
      type: recordedBlob.type,
    });

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
      setVideoFile(file);
      setVideoUrl(recordedUrl);
      setStatus("uploading");
    };
    video.onerror = () => {
      setVideoFile(file);
      setVideoUrl(recordedUrl);
      setStatus("uploading");
    };
    video.src = recordedUrl;
  }, [recordedBlob, recordedUrl, setVideoFile, setVideoUrl, setVideoDuration, setStatus]);

  const reRecord = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl("");
    setElapsedTime(0);
    resetScroll();
    setPhase("setup");
    setMobileSheetOpen(true);
    startCamera(selectedDevice || undefined);
  }, [recordedUrl, resetScroll, startCamera, selectedDevice]);

  const goBack = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setStatus("idle");
  }, [recordedUrl, setStatus]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (phase === "recording") toggleScroll();
          break;
        case "Escape":
          if (phase === "recording") stopRecording();
          break;
        case "ArrowUp":
          e.preventDefault();
          setTeleprompterSettings({
            scrollSpeed: Math.min(10, teleprompterSettings.scrollSpeed + 0.5),
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setTeleprompterSettings({
            scrollSpeed: Math.max(0.5, teleprompterSettings.scrollSpeed - 0.5),
          });
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, toggleScroll, stopRecording, teleprompterSettings.scrollSpeed, setTeleprompterSettings]);

  // Mobile sheet drag handling
  const handleSheetDragStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      sheetDragRef.current = { startY: clientY, startHeight: mobileSheetHeight };
    },
    [mobileSheetHeight]
  );

  const handleSheetDragMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!sheetDragRef.current) return;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const deltaY = sheetDragRef.current.startY - clientY;
      const deltaPercent = (deltaY / window.innerHeight) * 100;
      const newHeight = Math.min(85, Math.max(10, sheetDragRef.current.startHeight + deltaPercent));
      setMobileSheetHeight(newHeight);
    },
    []
  );

  const handleSheetDragEnd = useCallback(() => {
    if (!sheetDragRef.current) return;
    // Snap: if < 20% -> close, if > 20% -> stay open
    if (mobileSheetHeight < 20) {
      setMobileSheetOpen(false);
      setMobileSheetHeight(45);
    }
    sheetDragRef.current = null;
  }, [mobileSheetHeight]);

  const scriptLines = useMemo(() => {
    return teleprompterSettings.script.split("\n").map((line) => line.trim());
  }, [teleprompterSettings.script]);

  const hasScript = teleprompterSettings.script.trim().length > 0;

  // ============ SETTINGS PANEL CONTENT (shared between desktop sidebar and mobile sheet) ============
  const settingsContent = (
    <div className="p-4 space-y-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Configurações
      </h3>

      {availableDevices.length > 1 && (
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">Câmera</label>
          <select
            value={selectedDevice}
            onChange={(e) => switchCamera(e.target.value)}
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {availableDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Câmera ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
          <span>Tamanho do texto</span>
          <span className="text-[var(--foreground)]">{teleprompterSettings.fontSize}px</span>
        </label>
        <input type="range" min={16} max={72} value={teleprompterSettings.fontSize} onChange={(e) => setTeleprompterSettings({ fontSize: Number(e.target.value) })} className="w-full" />
      </div>

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
          <span>Velocidade de rolagem</span>
          <span className="text-[var(--foreground)]">{teleprompterSettings.scrollSpeed.toFixed(1)}x</span>
        </label>
        <input type="range" min={0.5} max={10} step={0.5} value={teleprompterSettings.scrollSpeed} onChange={(e) => setTeleprompterSettings({ scrollSpeed: Number(e.target.value) })} className="w-full" />
      </div>

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
          <span>Contagem regressiva</span>
          <span className="text-[var(--foreground)]">{teleprompterSettings.countdownSeconds}s</span>
        </label>
        <input type="range" min={0} max={10} value={teleprompterSettings.countdownSeconds} onChange={(e) => setTeleprompterSettings({ countdownSeconds: Number(e.target.value) })} className="w-full" />
      </div>

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
          <span>Opacidade do fundo</span>
          <span className="text-[var(--foreground)]">{Math.round(teleprompterSettings.opacity * 100)}%</span>
        </label>
        <input type="range" min={0} max={100} value={Math.round(teleprompterSettings.opacity * 100)} onChange={(e) => setTeleprompterSettings({ opacity: Number(e.target.value) / 100 })} className="w-full" />
      </div>

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
          <span>Posição da linha de leitura</span>
          <span className="text-[var(--foreground)]">{teleprompterSettings.cueLinePosition}%</span>
        </label>
        <input type="range" min={10} max={70} value={teleprompterSettings.cueLinePosition} onChange={(e) => setTeleprompterSettings({ cueLinePosition: Number(e.target.value) })} className="w-full" />
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm flex items-center gap-2">
            <FlipHorizontal className="w-4 h-4 text-[var(--text-secondary)]" />
            Espelhar texto
          </span>
          <button onClick={() => setTeleprompterSettings({ mirrorText: !teleprompterSettings.mirrorText })} className={`w-10 h-5 rounded-full transition-colors relative ${teleprompterSettings.mirrorText ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${teleprompterSettings.mirrorText ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </label>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm flex items-center gap-2">
            <Timer className="w-4 h-4 text-[var(--text-secondary)]" />
            Mostrar timer
          </span>
          <button onClick={() => setTeleprompterSettings({ showTimer: !teleprompterSettings.showTimer })} className={`w-10 h-5 rounded-full transition-colors relative ${teleprompterSettings.showTimer ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${teleprompterSettings.showTimer ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </label>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="h-12 bg-[var(--surface)] border-b border-[var(--border)] flex items-center px-4 gap-3 shrink-0 z-30">
        <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Type className="w-5 h-5 text-[var(--accent-light)]" />
          <span className="font-semibold text-sm">Teleprompter</span>
        </div>

        {phase === "recording" && teleprompterSettings.showTimer && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-mono text-red-400">{formatTimer(elapsedTime)}</span>
          </div>
        )}

        {phase === "setup" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-[var(--accent)]/20 text-[var(--accent-light)]" : "hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]"}`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main area: Camera + Teleprompter overlay */}
        <div className="flex-1 relative">
          {/* Camera preview */}
          <div className="absolute inset-0 bg-black flex items-center justify-center">
            {phase === "preview" && recordedUrl ? (
              <video ref={previewVideoRef} src={recordedUrl} className="w-full h-full object-contain" controls autoPlay playsInline />
            ) : (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline style={{ transform: "scaleX(-1)" }} />
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="text-center">
                      <Camera className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 animate-pulse" />
                      <p className="text-sm text-[var(--text-secondary)]">Iniciando câmera...</p>
                    </div>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="text-center max-w-sm px-4">
                      <CameraOff className="w-12 h-12 text-[var(--danger)] mx-auto mb-3" />
                      <p className="text-sm text-[var(--danger)] mb-4">{cameraError}</p>
                      <button onClick={() => startCamera()} className="px-4 py-2 bg-[var(--accent)] rounded-lg text-sm hover:bg-[var(--accent-hover)] transition-colors">
                        Tentar novamente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Teleprompter text overlay */}
          {phase !== "preview" && hasScript && (
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: `linear-gradient(to bottom, ${teleprompterSettings.backgroundColor}${Math.round(teleprompterSettings.opacity * 255).toString(16).padStart(2, "0")} 0%, transparent ${teleprompterSettings.cueLinePosition - 5}%, transparent ${teleprompterSettings.cueLinePosition + 5}%, ${teleprompterSettings.backgroundColor}${Math.round(teleprompterSettings.opacity * 0.7 * 255).toString(16).padStart(2, "0")} 100%)`,
              }}
            >
              <div className="absolute left-0 right-0 h-0.5 bg-[var(--accent)] z-20" style={{ top: `${teleprompterSettings.cueLinePosition}%` }}>
                <div className="absolute left-2 -top-1 w-2 h-2 bg-[var(--accent)] rotate-45" />
                <div className="absolute right-2 -top-1 w-2 h-2 bg-[var(--accent)] rotate-45" />
              </div>

              <div
                ref={scrollContainerRef}
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ paddingTop: `${teleprompterSettings.cueLinePosition}%`, paddingBottom: "60%" }}
              >
                <div
                  className="text-center"
                  style={{
                    padding: `0 ${teleprompterSettings.paddingHorizontal}%`,
                    transform: teleprompterSettings.mirrorText ? "scaleX(-1)" : "none",
                  }}
                >
                  {scriptLines.map((line, i) => (
                    <p
                      key={i}
                      style={{
                        fontSize: `${teleprompterSettings.fontSize}px`,
                        lineHeight: teleprompterSettings.lineHeight,
                        color: teleprompterSettings.textColor,
                        fontWeight: 600,
                        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                        marginBottom: line === "" ? "1em" : "0.3em",
                        minHeight: line === "" ? "0.5em" : undefined,
                      }}
                    >
                      {line || "\u00A0"}
                    </p>
                  ))}
                  <div style={{ height: "50vh" }} />
                </div>
              </div>
            </div>
          )}

          {/* Countdown overlay */}
          <AnimatePresence>
            {phase === "countdown" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
                <motion.div key={countdownValue} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.4 }} className="text-8xl font-bold text-white" style={{ textShadow: "0 0 40px var(--accent)" }}>
                  {countdownValue}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recording controls overlay */}
          {phase === "recording" && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
              <button onClick={toggleScroll} className="p-3 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors active:bg-white/30" title={isScrolling ? "Pausar rolagem" : "Retomar rolagem"}>
                {isScrolling ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white" />}
              </button>

              <button onClick={stopRecording} className="p-4 rounded-full bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-600/30 active:scale-95" title="Parar gravação">
                <Square className="w-6 h-6 text-white fill-white" />
              </button>

              <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full px-3 py-2">
                <button onClick={() => setTeleprompterSettings({ scrollSpeed: Math.max(0.5, teleprompterSettings.scrollSpeed - 0.5) })} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                  <ChevronDown className="w-4 h-4 text-white" />
                </button>
                <span className="text-xs text-white font-mono min-w-[2rem] text-center">{teleprompterSettings.scrollSpeed.toFixed(1)}x</span>
                <button onClick={() => setTeleprompterSettings({ scrollSpeed: Math.min(10, teleprompterSettings.scrollSpeed + 0.5) })} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                  <ChevronUp className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          )}

          {/* Setup: Record button */}
          {phase === "setup" && cameraReady && (
            <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4">
              <button
                onClick={startRecording}
                disabled={!hasScript}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all shadow-lg active:scale-95 ${hasScript ? "bg-red-600 hover:bg-red-500 text-white shadow-red-600/30" : "bg-[var(--surface)] text-[var(--text-secondary)] cursor-not-allowed"}`}
              >
                <div className="w-3 h-3 rounded-full bg-white" />
                Gravar
              </button>
            </div>
          )}

          {/* Preview: Action buttons */}
          {phase === "preview" && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
              <button onClick={reRecord} className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors text-white active:scale-95">
                <RotateCcw className="w-4 h-4" />
                Regravar
              </button>
              <button onClick={useRecording} className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors text-white font-medium shadow-lg shadow-[var(--accent)]/30 active:scale-95">
                <Video className="w-4 h-4" />
                Usar e Editar
              </button>
            </div>
          )}

          {/* Mobile: floating script button when sheet is closed */}
          {phase === "setup" && !mobileSheetOpen && (
            <button
              onClick={() => setMobileSheetOpen(true)}
              className="md:hidden absolute top-3 right-3 z-20 p-2.5 rounded-full bg-[var(--accent)] shadow-lg shadow-[var(--accent)]/30 active:scale-95 transition-transform"
            >
              <Eye className="w-5 h-5 text-white" />
            </button>
          )}
        </div>

        {/* ====== DESKTOP: Right sidebar ====== */}
        {(phase === "setup" || (phase !== "preview" && showSettings)) && (
          <div className="hidden md:flex w-96 bg-[var(--surface)] border-l border-[var(--border)] flex-col shrink-0">
            {/* Settings panel (collapsible) */}
            <AnimatePresence>
              {showSettings && phase === "setup" && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-[var(--border)] overflow-hidden">
                  <div className="max-h-[50vh] overflow-y-auto">{settingsContent}</div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Script editor */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 pb-2 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--accent-light)]" />
                  Roteiro
                </h3>
                {hasScript && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {teleprompterSettings.script.split(/\s+/).filter(Boolean).length} palavras
                  </span>
                )}
              </div>
              <div className="flex-1 px-4 pb-4 min-h-0">
                <textarea
                  value={teleprompterSettings.script}
                  onChange={(e) => setTeleprompterSettings({ script: e.target.value })}
                  placeholder={"Cole ou digite seu roteiro aqui...\n\nUse linhas em branco para separar parágrafos.\n\nDicas:\n• Escreva de forma natural e conversacional\n• Use frases curtas para facilitar a leitura\n• Marque pausas com linhas em branco"}
                  className="w-full h-full bg-[var(--background)] border border-[var(--border)] rounded-xl p-4 text-sm resize-none outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-secondary)]/50"
                  style={{ lineHeight: 1.7 }}
                />
              </div>
            </div>

            {/* Keyboard shortcuts hint */}
            {phase === "setup" && (
              <div className="px-4 pb-4 shrink-0">
                <div className="bg-[var(--background)] rounded-lg p-3 text-[10px] text-[var(--text-secondary)] space-y-1">
                  <p className="font-semibold text-xs text-[var(--foreground)] mb-1.5">Atalhos durante gravação</p>
                  <p><kbd className="px-1.5 py-0.5 bg-[var(--surface)] rounded text-[var(--foreground)]">Espaço</kbd> Pausar/retomar rolagem</p>
                  <p><kbd className="px-1.5 py-0.5 bg-[var(--surface)] rounded text-[var(--foreground)]">↑↓</kbd> Ajustar velocidade</p>
                  <p><kbd className="px-1.5 py-0.5 bg-[var(--surface)] rounded text-[var(--foreground)]">Esc</kbd> Parar gravação</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== MOBILE: Bottom sheet for script + settings ====== */}
        {phase === "setup" && mobileSheetOpen && (
          <div
            className="md:hidden absolute bottom-0 left-0 right-0 z-20 bg-[var(--surface)] border-t border-[var(--border)] rounded-t-2xl flex flex-col"
            style={{ height: `${mobileSheetHeight}%` }}
          >
            {/* Drag handle */}
            <div
              className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing touch-none shrink-0"
              onTouchStart={handleSheetDragStart}
              onTouchMove={handleSheetDragMove}
              onTouchEnd={handleSheetDragEnd}
              onMouseDown={handleSheetDragStart}
              onMouseMove={handleSheetDragMove}
              onMouseUp={handleSheetDragEnd}
            >
              <div className="w-10 h-1 rounded-full bg-[var(--text-secondary)]/30" />
            </div>

            {/* Sheet header with tabs */}
            <div className="flex items-center justify-between px-4 pb-2 shrink-0">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Eye className="w-4 h-4 text-[var(--accent-light)]" />
                Roteiro
                {hasScript && (
                  <span className="text-xs text-[var(--text-secondary)] font-normal ml-1">
                    {teleprompterSettings.script.split(/\s+/).filter(Boolean).length} palavras
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-[var(--accent)]/20 text-[var(--accent-light)]" : "text-[var(--text-secondary)]"}`}
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button onClick={() => setMobileSheetOpen(false)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sheet content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {showSettings ? (
                settingsContent
              ) : (
                <div className="px-4 pb-4 h-full">
                  <textarea
                    value={teleprompterSettings.script}
                    onChange={(e) => setTeleprompterSettings({ script: e.target.value })}
                    placeholder={"Cole ou digite seu roteiro aqui...\n\nDicas:\n• Escreva de forma natural\n• Use frases curtas\n• Linhas em branco = pausas"}
                    className="w-full h-full bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 text-sm resize-none outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-secondary)]/50"
                    style={{ lineHeight: 1.7, minHeight: 120 }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
