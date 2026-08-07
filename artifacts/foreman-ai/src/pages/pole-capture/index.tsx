/**
 * Pole Capture — first screen in Redline.
 *
 * Shows a large "Take Pole Photo" button and an "Upload Photo" option.
 * Requests GPS, compresses the photo, uploads it for AI analysis,
 * then navigates to /pole-capture/:id for the foreman's review.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, MapPin, Loader2, AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCompanyStore } from "@/hooks/use-company-store";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

// ── photo compression (mirrors step-photos.tsx) ─────────────────────────────
async function compressPhoto(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({
        base64: dataUrl.split(",")[1],
        mimeType: "image/jpeg",
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── GPS helpers ──────────────────────────────────────────────────────────────
type GpsState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" };

function useGps() {
  const [gps, setGps] = useState<GpsState>({ status: "idle" });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setGps({ status: "unavailable" });
      return;
    }
    setGps({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGps({ status: "denied" });
        else setGps({ status: "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, []);

  useEffect(() => { request(); }, [request]);

  return { gps, retryGps: request };
}

export default function PoleCaptureEntryPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyStore();
  const { gps, retryGps } = useGps();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // ── shared upload + analyze ───────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!activeCompanyId) {
      toast({ title: "No company selected", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Image too large (max 20 MB)", variant: "destructive" });
      return;
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setAnalyzing(true);

    try {
      const { base64, mimeType } = await compressPhoto(file);

      const body: Record<string, unknown> = {
        companyId: activeCompanyId,
        photoData: base64,
        photoMimeType: mimeType,
      };
      if (gps.status === "ok") {
        body.gpsLat = gps.lat;
        body.gpsLng = gps.lng;
        body.gpsAccuracyM = gps.accuracy;
      }

      const res = await fetch(`${BASE()}/api/pole-capture/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      navigate(`/pole-capture/${data.id}`);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
      setPreview(null);
      setAnalyzing(false);
    }
  }, [activeCompanyId, gps, navigate, toast]);

  const onCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const onLibraryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  // ── GPS status pill ───────────────────────────────────────────────────────
  const GpsPill = () => {
    if (gps.status === "ok") {
      return (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-green-500">
          <MapPin className="h-3.5 w-3.5" />
          <span>GPS locked ({Math.round(gps.accuracy)}m)</span>
        </div>
      );
    }
    if (gps.status === "requesting") {
      return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Getting GPS…</span>
        </div>
      );
    }
    if (gps.status === "denied" || gps.status === "unavailable") {
      return (
        <button
          onClick={retryGps}
          className="flex items-center gap-1.5 text-xs font-medium text-yellow-500 hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span>No GPS — tap to retry</span>
        </button>
      );
    }
    return null;
  };

  // ── analyzing overlay ─────────────────────────────────────────────────────
  if (analyzing && preview) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-8">
        <div className="relative w-full max-w-sm aspect-[3/4] overflow-hidden rounded-2xl border-2 border-primary/50">
          <img src={preview} alt="Pole being analyzed" className="w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="bg-black/80 rounded-2xl px-6 py-5 flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-white font-bold text-lg">Analyzing pole…</p>
              <p className="text-zinc-400 text-sm text-center">Reading tag, identifying equipment,<br />matching to active job</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Zap className="h-4 w-4 text-primary" />
          <span>AI analysis powered by Redline PKB</span>
        </div>
      </div>
    );
  }

  // ── main capture screen ───────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col">
      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onCameraChange}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onLibraryChange}
      />

      {/* Hero area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-8">
        {/* Icon */}
        <div className="relative">
          <div className="w-36 h-36 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-primary/20 ring-offset-4 ring-offset-background">
            <Camera className="h-20 w-20 text-primary" strokeWidth={1.25} />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-primary rounded-full p-2 shadow-lg shadow-primary/30">
            <Zap className="h-5 w-5 text-primary-foreground" fill="currentColor" />
          </div>
        </div>

        {/* Copy */}
        <div className="text-center space-y-3 max-w-xs">
          <h1 className="text-3xl font-black tracking-tight uppercase">Take Pole Photo</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Point your camera at the pole. Redline will automatically identify the pole, match the job, and prefill your report.
          </p>
        </div>

        {/* GPS indicator */}
        <GpsPill />

        {/* Primary CTA */}
        <div className="w-full max-w-xs flex flex-col gap-4">
          <Button
            size="lg"
            className="w-full h-20 text-xl font-bold shadow-2xl shadow-primary/30 gap-3 rounded-2xl"
            onClick={() => cameraInputRef.current?.click()}
            disabled={!activeCompanyId}
          >
            <Camera className="h-7 w-7" />
            Take Pole Photo
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="w-full h-14 text-base font-semibold gap-2 rounded-xl"
            onClick={() => libraryInputRef.current?.click()}
            disabled={!activeCompanyId}
          >
            <Upload className="h-5 w-5" />
            Upload from Library
          </Button>
        </div>

        {!activeCompanyId && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Select a company to continue</span>
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div className="pb-8 px-6 text-center text-xs text-muted-foreground/60 space-y-1">
        <p>AI analysis reads pole tag, equipment, and completed work.</p>
        <p>You review and confirm everything before any report is created.</p>
      </div>
    </div>
  );
}
