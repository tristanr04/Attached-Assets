/**
 * Visual Reference Library — Task #23
 * Upload and label reference photos for each structure configuration.
 * Images are stored as base64 in pkb_visual_references (imageData column).
 * The list endpoint omits imageData for performance; full image loaded on demand.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList } from "./pkb-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Upload, X, Loader2, Image as ImageIcon, ZoomIn, Trash2, Plus, MoreVertical, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

// Camera angles from the PKB schema constant
const CAMERA_ANGLES = [
  { value: "ground_level_full", label: "Ground Level — Full Pole" },
  { value: "aerial_top_framing", label: "Aerial — Top Framing" },
  { value: "aerial_conductor", label: "Aerial — Conductor & Crossarm" },
  { value: "close_up_transformer", label: "Close-Up — Transformer" },
  { value: "close_up_cutout", label: "Close-Up — Cutout / Arrester" },
  { value: "close_up_guy_anchor", label: "Close-Up — Guy & Anchor" },
  { value: "pole_tag", label: "Pole Tag / Stamp" },
  { value: "base_ground", label: "Pole Base / Ground Level" },
  { value: "before_work", label: "Before Work (Context)" },
  { value: "after_work", label: "After Work (Completed)" },
];

interface VisualRef {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  structureConfigCode: string | null;
  cameraAngle: string | null;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  // imageData is omitted from list for performance
}

interface StructureConfig {
  id: number;
  name: string;
  code: string;
}

// ── Image upload helper ───────────────────────────────────────────────────────
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressToJpeg(file: File, maxPx = 1600, quality = 0.82): Promise<string> {
  const url = await toDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Upload dialog ─────────────────────────────────────────────────────────────
function UploadDialog({
  open, onClose, companyId, structureConfigs,
}: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  structureConfigs: StructureConfig[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    structureConfigCode: "",
    cameraAngle: "",
    tags: "",
  });

  const upload = useMutation({
    mutationFn: (body: any) =>
      fetch(`${BASE()}/api/pkb/visual-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => { if (!r.ok) throw new Error("Upload failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pkb-visual-refs", companyId] });
      toast({ title: "Reference photo added" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const data = await compressToJpeg(file);
      setPreview(data);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  };

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) { toast({ title: "Please select an image", variant: "destructive" }); return; }
    await upload.mutateAsync({
      companyId,
      name: form.name,
      description: form.description || null,
      structureConfigCode: form.structureConfigCode || null,
      cameraAngle: form.cameraAngle || null,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      imageData: preview,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight">Add Reference Photo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Image picker */}
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFile} />
            {preview ? (
              <div className="relative">
                <img src={preview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border border-border bg-black" />
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm font-bold">Click to upload reference photo</span>
                <span className="text-xs">JPEG, PNG or WebP</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Label *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Three-Phase Dead-End — Full Pole" required />
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Structure Configuration</Label>
            <Select value={form.structureConfigCode} onValueChange={v => set("structureConfigCode", v)}>
              <SelectTrigger><SelectValue placeholder="Select structure config…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Any / General —</SelectItem>
                {structureConfigs.map(sc => (
                  <SelectItem key={sc.code} value={sc.code}>{sc.name} ({sc.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Camera Angle</Label>
            <Select value={form.cameraAngle} onValueChange={v => set("cameraAngle", v)}>
              <SelectTrigger><SelectValue placeholder="Select camera angle…" /></SelectTrigger>
              <SelectContent>
                {CAMERA_ANGLES.map(a => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Description</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="What should the foreman look for in this angle?" rows={2} className="text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="e.g. wood, class-3, tangent" />
            <p className="text-xs text-muted-foreground">Used to filter references during analysis.</p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="font-bold">Cancel</Button>
            <Button type="submit" className="font-bold gap-2" disabled={upload.isPending}>
              {upload.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload Reference
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Image lightbox ────────────────────────────────────────────────────────────
function RefLightbox({ id, companyId, name, onClose }: { id: number; companyId: number; name: string; onClose: () => void }) {
  const { data: detail } = useQuery<{ imageData?: string }>({
    queryKey: ["pkb-vr-detail", id],
    queryFn: () =>
      fetch(`${BASE()}/api/pkb/visual-references/${id}?companyId=${companyId}`).then(r => r.json()),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white bg-white/10 rounded-full p-2 hover:bg-white/20" onClick={onClose}>
        <X className="h-6 w-6" />
      </button>
      {detail?.imageData ? (
        <img src={detail.imageData} alt={name} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
      ) : (
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────
export function SectionVisualReferences() {
  const { activeCompanyId } = useCompanyStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightboxRef, setLightboxRef] = useState<VisualRef | null>(null);
  const [filterConfig, setFilterConfig] = useState("");

  const { data: refs = [], isLoading } = useQuery<VisualRef[]>({
    queryKey: ["pkb-visual-refs", activeCompanyId],
    queryFn: () =>
      fetch(`${BASE()}/api/pkb/visual-references?companyId=${activeCompanyId}`).then(r =>
        r.ok ? r.json() : []
      ),
    enabled: !!activeCompanyId,
  });

  const { data: structureConfigs = [] } = usePkbList<StructureConfig>("structure-configs", activeCompanyId ?? undefined);

  const deleteRef = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE()}/api/pkb/visual-references/${id}`, { method: "DELETE" }).then(r => {
        if (!r.ok) throw new Error("Delete failed");
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pkb-visual-refs", activeCompanyId] });
      toast({ title: "Reference photo deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = filterConfig
    ? (refs as VisualRef[]).filter(r => r.structureConfigCode === filterConfig)
    : (refs as VisualRef[]);

  // Group by structureConfigCode
  const grouped = filtered.reduce<Record<string, VisualRef[]>>((acc, r) => {
    const key = r.structureConfigCode ?? "general";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const configLabelMap = Object.fromEntries(
    (structureConfigs as StructureConfig[]).map(sc => [sc.code, sc.name])
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
      {lightboxRef && activeCompanyId && (
        <RefLightbox
          id={lightboxRef.id}
          companyId={activeCompanyId}
          name={lightboxRef.name}
          onClose={() => setLightboxRef(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight">Visual References</h2>
          <p className="text-muted-foreground font-medium text-sm mt-0.5">
            {filtered.length} of {(refs as VisualRef[]).length} reference photos
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="font-bold gap-2 uppercase tracking-wide">
          <Plus className="h-4 w-4" /> Add Reference Photo
        </Button>
      </div>

      {/* Filter */}
      {(structureConfigs as StructureConfig[]).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setFilterConfig("")}
            className={cn("text-xs font-bold px-3 py-1.5 rounded-full border transition-colors", !filterConfig ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary")}
          >
            All
          </button>
          {(structureConfigs as StructureConfig[]).map(sc => (
            <button
              key={sc.code}
              onClick={() => setFilterConfig(filterConfig === sc.code ? "" : sc.code)}
              className={cn("text-xs font-bold px-3 py-1.5 rounded-full border transition-colors", filterConfig === sc.code ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary")}
            >
              {sc.name}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 gap-4 border border-dashed border-border rounded-xl text-muted-foreground">
          <ImageIcon className="h-12 w-12 opacity-30" />
          <div className="text-center">
            <p className="font-bold">No reference photos yet</p>
            <p className="text-sm mt-1">Upload example photos so the AI knows what each structure looks like.</p>
          </div>
          <Button variant="outline" onClick={() => setUploadOpen(true)} className="font-bold gap-2">
            <Upload className="h-4 w-4" /> Upload First Reference
          </Button>
        </div>
      )}

      {/* Grouped photo grid */}
      {Object.entries(grouped).map(([configCode, items]) => (
        <div key={configCode} className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-extrabold text-sm uppercase tracking-wide">
              {configCode === "general" ? "General References" : (configLabelMap[configCode] ?? configCode)}
            </h3>
            <Badge variant="secondary" className="text-xs">{items.length} photos</Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map(ref => (
              <div
                key={ref.id}
                className={cn("group relative border border-border rounded-xl overflow-hidden bg-card", !ref.isActive && "opacity-50")}
              >
                {/* Placeholder thumbnail (no imageData in list response) */}
                <button
                  onClick={() => setLightboxRef(ref)}
                  className="w-full aspect-square bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                    <ImageIcon className="h-10 w-10 opacity-40" />
                    <ZoomIn className="h-4 w-4 opacity-0 group-hover:opacity-60 absolute" />
                  </div>
                </button>

                <div className="p-2 space-y-1">
                  <p className="text-xs font-bold truncate">{ref.name}</p>
                  {ref.cameraAngle && (
                    <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {CAMERA_ANGLES.find(a => a.value === ref.cameraAngle)?.label ?? ref.cameraAngle}
                    </p>
                  )}
                </div>

                {/* Actions overlay */}
                <div className="absolute top-1 right-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 bg-black/30 hover:bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setLightboxRef(ref)}>
                        <ZoomIn className="h-4 w-4 mr-2" /> View Full Size
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${ref.name}"?`)) deleteRef.mutate(ref.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {activeCompanyId && (
        <UploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          companyId={activeCompanyId}
          structureConfigs={structureConfigs as StructureConfig[]}
        />
      )}
    </>
  );
}
