import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type DailyReportDetail } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera, Upload, Trash2, RefreshCcw, CheckCircle2, AlertCircle,
  Image as ImageIcon, X, Loader2, ZoomIn,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApiQuery, useApiMutation } from "@/hooks/use-api";

// ── Constants ─────────────────────────────────────────────────────────────────
type PhotoCategory =
  | "full_pole" | "pole_tag" | "top_framing" | "transformer"
  | "base" | "damage" | "before_work" | "during_work" | "after_work" | "other";

const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  full_pole: "Full Pole",
  pole_tag: "Pole Tag / Stamp",
  top_framing: "Top Framing",
  transformer: "Transformer / Equipment",
  base: "Pole Base",
  damage: "Damage",
  before_work: "Before Work",
  during_work: "During Work",
  after_work: "After Work",
  other: "Other",
};

const REQUIRED_CATEGORIES: PhotoCategory[] = ["full_pole", "pole_tag", "top_framing"];
const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DIM = 1600;
const JPEG_Q = 0.82;

interface SavedPhoto {
  id: number;
  reportId: number;
  url: string;
  caption: string | null;
  category: string;
  createdAt: string;
}

interface PendingPhoto {
  dataUrl: string;
  category: PhotoCategory;
  caption: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateFile(file: File): string | null {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime === "image/heic" || mime === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif")) {
    return "HEIC photos from iPhone are not supported yet. In your Photos app, export as JPEG first.";
  }
  if (!ACCEPTED_MIME.includes(mime)) {
    return `Unsupported format (${mime || "unknown"}). Use JPEG, PNG, or WebP.`;
  }
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB max 20 MB).`;
  }
  return null;
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
          else { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas unavailable.")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_Q));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white bg-white/10 rounded-full p-2 hover:bg-white/20" onClick={onClose}>
        <X className="h-6 w-6" />
      </button>
      <img src={url} alt="Full view" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StepPhotos({ report }: { report: DailyReportDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const photosEndpoint = `/api/reports/${report.id}/photos`;

  const { data: photos = [], isLoading: photosLoading } = useApiQuery<SavedPhoto[]>(photosEndpoint);

  const uploadMutation = useApiMutation<
    { dataUrl: string; caption: string; category: string },
    SavedPhoto
  >("POST", photosEndpoint);

  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<Record<number, string>>({});
  const [savingCaption, setSavingCaption] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const isLocked = report.status === "complete";
  const uploadedCategories = new Set((photos as SavedPhoto[]).map((p) => p.category as PhotoCategory));

  // ── File selected ─────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateFile(file);
    if (err) { toast({ title: "Cannot use this photo", description: err, variant: "destructive" }); return; }
    try {
      const dataUrl = await compressImage(file);
      setPending({ dataUrl, category: "full_pole", caption: "" });
      setUploadError(null);
    } catch (ex) {
      toast({ title: "Failed to process image", description: String(ex), variant: "destructive" });
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!pending) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadMutation.mutateAsync({ body: { dataUrl: pending.dataUrl, caption: pending.caption, category: pending.category } });
      queryClient.invalidateQueries({ queryKey: [`${BASE}${photosEndpoint}`] });
      setPending(null);
      toast({ title: "Photo saved", description: `${CATEGORY_LABELS[pending.category]} photo added.` });
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (photoId: number) => {
    if (isLocked) { toast({ title: "Locked", description: "Photos on submitted reports cannot be deleted.", variant: "destructive" }); return; }
    setDeletingId(photoId);
    try {
      const res = await fetch(`${BASE}/api/reports/${report.id}/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: [`${BASE}${photosEndpoint}`] });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ── Save caption ──────────────────────────────────────────────────────────
  const handleSaveCaption = async (photoId: number) => {
    setSavingCaption(photoId);
    try {
      const res = await fetch(`${BASE}/api/reports/${report.id}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: editingCaption[photoId] ?? "" }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: [`${BASE}${photosEndpoint}`] });
      setEditingCaption((p) => { const n = { ...p }; delete n[photoId]; return n; });
    } catch {
      toast({ title: "Failed to save caption", variant: "destructive" });
    } finally {
      setSavingCaption(null);
    }
  };

  // ── Category change ───────────────────────────────────────────────────────
  const handleCategory = async (photoId: number, category: string) => {
    try {
      const res = await fetch(`${BASE}/api/reports/${report.id}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: [`${BASE}${photosEndpoint}`] });
    } catch {
      toast({ title: "Failed to update category", variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 pb-28 space-y-6">
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      <h3 className="font-extrabold uppercase tracking-widest text-sm flex items-center gap-2">
        <Camera className="h-5 w-5 text-primary" /> Photo Evidence
      </h3>

      {/* Required checklist */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Required Photos</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {REQUIRED_CATEGORIES.map((cat) => {
            const done = uploadedCategories.has(cat);
            return (
              <div key={cat} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold ${done ? "bg-green-500/10 border-green-500/40 text-green-700 dark:text-green-400" : "bg-yellow-500/10 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"}`}>
                {done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {CATEGORY_LABELS[cat]}
              </div>
            );
          })}
        </div>
      </div>

      {/* Capture buttons */}
      {!pending && !isLocked && (
        <div className="flex flex-col sm:flex-row gap-3">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={libraryRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFile} />

          <Button onClick={() => cameraRef.current?.click()} className="flex-1 h-14 gap-2 font-bold uppercase tracking-wider text-base" size="lg">
            <Camera className="h-5 w-5" /> Take Pole Photo
          </Button>
          <Button onClick={() => libraryRef.current?.click()} variant="outline" className="flex-1 h-14 gap-2 font-bold uppercase tracking-wider text-base" size="lg">
            <Upload className="h-5 w-5" /> Upload Existing Photo
          </Button>
        </div>
      )}

      {/* Error banner */}
      {uploadError && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/40 rounded-lg p-3 text-sm text-destructive font-medium">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div><p className="font-bold">Upload failed</p><p>{uploadError}</p></div>
          <button className="ml-auto text-destructive hover:text-destructive/80" onClick={() => setUploadError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Preview panel */}
      {pending && (
        <Card className="border-primary shadow-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-black flex justify-center">
              <img src={pending.dataUrl} alt="Preview" className="max-h-72 max-w-full object-contain" />
            </div>
            <div className="p-4 space-y-4">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Photo Category</Label>
                <select
                  value={pending.category}
                  onChange={(e) => setPending({ ...pending, category: e.target.value as PhotoCategory })}
                  className="w-full h-12 px-3 rounded-lg border border-border bg-background font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {(Object.keys(CATEGORY_LABELS) as PhotoCategory[]).map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Caption (optional)</Label>
                <Input placeholder="Describe this photo…" value={pending.caption} onChange={(e) => setPending({ ...pending, caption: e.target.value })} className="h-12" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1 h-12 font-bold gap-2" onClick={() => { setPending(null); setUploadError(null); }} disabled={isUploading}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
                <Button variant="outline" className="flex-1 h-12 font-bold gap-2" disabled={isUploading}
                  onClick={() => { setPending(null); setUploadError(null); setTimeout(() => cameraRef.current?.click(), 50); }}>
                  <RefreshCcw className="h-4 w-4" /> Retake
                </Button>
                <Button className="flex-1 h-12 font-bold gap-2" onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><CheckCircle2 className="h-4 w-4" /> Use Photo</>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved photos */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Uploaded Photos {(photos as SavedPhoto[]).length > 0 && <span className="ml-1 text-foreground">({(photos as SavedPhoto[]).length})</span>}
        </p>

        {photosLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (photos as SavedPhoto[]).length === 0 ? (
          <Card className="border-dashed bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <ImageIcon className="h-12 w-12 opacity-20" />
              <p className="font-bold text-base text-muted-foreground">No photos yet</p>
              <p className="text-sm text-muted-foreground">Tap <strong>Take Pole Photo</strong> to add evidence.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(photos as SavedPhoto[]).map((photo) => {
              const captionDraft = editingCaption[photo.id];
              const isEditing = captionDraft !== undefined;
              const cat = (photo.category ?? "other") as PhotoCategory;

              return (
                <Card key={photo.id} className="border-border overflow-hidden shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex gap-3 p-3">
                      {/* Thumbnail */}
                      <button
                        onClick={() => setLightboxUrl(photo.url)}
                        className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border group"
                        title="View full size"
                      >
                        <img src={photo.url} alt={photo.caption || "Photo"} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          {!isLocked ? (
                            <select
                              value={cat}
                              onChange={(e) => handleCategory(photo.id, e.target.value)}
                              className="text-xs font-bold px-2 py-1 rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {(Object.keys(CATEGORY_LABELS) as PhotoCategory[]).map((c) => (
                                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant="secondary" className="text-xs font-bold">{CATEGORY_LABELS[cat]}</Badge>
                          )}
                          {!isLocked && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() => handleDelete(photo.id)}
                              disabled={deletingId === photo.id}
                              title="Delete photo"
                            >
                              {deletingId === photo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>

                        {!isLocked ? (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add caption…"
                              value={isEditing ? captionDraft : (photo.caption ?? "")}
                              onChange={(e) => setEditingCaption((p) => ({ ...p, [photo.id]: e.target.value }))}
                              onFocus={() => { if (!isEditing) setEditingCaption((p) => ({ ...p, [photo.id]: photo.caption ?? "" })); }}
                              className="h-8 text-sm"
                            />
                            {isEditing && (
                              <Button size="sm" className="h-8 px-3 shrink-0" onClick={() => handleSaveCaption(photo.id)} disabled={savingCaption === photo.id}>
                                {savingCaption === photo.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                              </Button>
                            )}
                          </div>
                        ) : (
                          photo.caption && <p className="text-sm text-muted-foreground">{photo.caption}</p>
                        )}

                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Saved
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Analyze callout */}
      {(photos as SavedPhoto[]).length > 0 && (
        <div className="flex items-start gap-3 bg-secondary/40 border border-border rounded-lg p-4 text-sm">
          <ImageIcon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Photo saved.</p>
            <p className="text-muted-foreground mt-0.5">Automated pole analysis is not configured yet. Photos are saved as billing evidence.</p>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="flex items-center gap-2 bg-secondary/40 border border-border rounded-lg p-3 text-sm text-muted-foreground font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This report is submitted. Photos are locked.
        </div>
      )}
    </div>
  );
}
