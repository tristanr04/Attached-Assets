import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList, usePkbCreate, usePkbUpdate, usePkbDelete, usePkbActivate, usePkbDuplicate } from "./pkb-hooks";
import { StatusBadge } from "./pkb-table";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, MoreVertical, Pencil, Copy, Trash2, PowerOff, Zap, Loader2, Search,
  ChevronDown, ChevronRight, Package, FileText, Camera
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface WorkPackage {
  id: number;
  name: string;
  code: string;
  customerId: string | null;
  accessType: string | null;
  poleMaterial: string | null;
  poleHeight: string | null;
  poleClass: string | null;
  versionStatus: string;
  isActive: boolean;
  expectedWork: any[];
  resources: any;
  documentation: any;
  billing: any;
}

function RequiredPhotosBadge({ doc }: { doc: any }) {
  const count = doc?.requiredPhotos?.filter((p: any) => p.required)?.length ?? 0;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Camera className="h-3.5 w-3.5" />
      {count} required
    </span>
  );
}

function BillingCodesBadge({ billing }: { billing: any }) {
  const count = billing?.requiredCodes?.length ?? 0;
  return (
    <Badge variant="secondary" className="text-xs font-medium gap-1">
      {count} billing codes
    </Badge>
  );
}

// ── Expandable work package row ──────────────────────────────────────────────
function WorkPackageRow({
  wp, onEdit, onDuplicate, onToggleActive, onDelete,
}: {
  wp: WorkPackage;
  onEdit: (wp: WorkPackage) => void;
  onDuplicate: (id: number) => void;
  onToggleActive: (wp: WorkPackage) => void;
  onDelete: (wp: WorkPackage) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const workItems: any[] = Array.isArray(wp.expectedWork) ? wp.expectedWork : [];
  const requiredPhotos: any[] = wp.documentation?.requiredPhotos ?? [];
  const billingCodes: any[] = wp.billing?.requiredCodes ?? [];

  return (
    <>
      <tr
        className={cn(
          "border-b border-border",
          !wp.isActive && "opacity-60",
          expanded ? "bg-secondary/30" : "hover:bg-secondary/10 cursor-pointer"
        )}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3 w-8">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3">
          <p className="font-bold text-sm">{wp.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{wp.code}</p>
        </td>
        <td className="px-4 py-3 text-sm">
          {[wp.poleMaterial, wp.poleHeight ? `${wp.poleHeight}ft` : null, wp.poleClass ? `Class ${wp.poleClass}` : null]
            .filter(Boolean).join(" · ") || "—"}
        </td>
        <td className="px-4 py-3">
          <span className="capitalize text-sm">{(wp.accessType ?? "—").replace(/_/g, " ")}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <Badge variant="outline" className="text-xs">{workItems.length} actions</Badge>
            <BillingCodesBadge billing={wp.billing} />
            <RequiredPhotosBadge doc={wp.documentation} />
          </div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={wp.versionStatus} isActive={wp.isActive} />
        </td>
        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(wp)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(wp.id)}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onToggleActive(wp)}>
                {wp.isActive ? <><PowerOff className="h-4 w-4 mr-2" /> Deactivate</> : <><Zap className="h-4 w-4 mr-2" /> Activate</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(wp)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="border-b border-border bg-secondary/20">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
              {/* Work actions */}
              <div>
                <p className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Expected Work
                </p>
                {workItems.length === 0 ? (
                  <p className="text-muted-foreground text-xs">None defined</p>
                ) : (
                  <ul className="space-y-1">
                    {workItems.map((w: any, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <Badge variant={w.type === "required" ? "default" : "secondary"} className="text-[10px] shrink-0">{w.type}</Badge>
                        <span className="font-mono">{w.workActionCode}</span>
                        {w.defaultQty > 1 && <span className="text-muted-foreground">×{w.defaultQty}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Billing codes */}
              <div>
                <p className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  Billing Codes
                </p>
                {billingCodes.length === 0 ? (
                  <p className="text-muted-foreground text-xs">None defined</p>
                ) : (
                  <ul className="space-y-1">
                    {billingCodes.map((c: any, i: number) => (
                      <li key={i} className="text-xs">
                        <span className="font-mono text-muted-foreground">{c.code}</span>
                        <span className="text-muted-foreground"> — {c.unitType} (min {c.minCharge})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Required photos */}
              <div>
                <p className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> Required Photos
                </p>
                {requiredPhotos.length === 0 ? (
                  <p className="text-muted-foreground text-xs">None defined</p>
                ) : (
                  <ul className="space-y-1">
                    {requiredPhotos.map((p: any, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <Badge variant={p.required ? "default" : "secondary"} className="text-[10px] shrink-0">{p.required ? "req" : "opt"}</Badge>
                        <span className="font-mono text-muted-foreground">{p.category}</span>
                        <span>{p.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────
function WorkPackageForm({
  open, onClose, initial,
}: { open: boolean; onClose: () => void; initial?: WorkPackage }) {
  const { activeCompanyId } = useCompanyStore();
  const { toast } = useToast();
  const isEdit = !!initial;

  const emptyForm = {
    companyId: activeCompanyId,
    name: "", code: "", customerId: "", accessType: "roadside",
    poleMaterial: "wood", poleHeight: "", poleClass: "",
    versionStatus: "draft", isActive: true,
    expectedWork: [],
    resources: { laborClassifications: [], equipment: [] },
    documentation: { requiredPhotos: [], gpsRequired: true, signatureRequired: false },
    billing: { requiredCodes: [] },
  };

  const [form, setForm] = useState<any>(initial ?? emptyForm);
  // JSON textarea for complex fields
  const [expectedWorkJson, setExpectedWorkJson] = useState(
    JSON.stringify(initial?.expectedWork ?? [], null, 2)
  );
  const [billingJson, setBillingJson] = useState(
    JSON.stringify(initial?.billing ?? { requiredCodes: [] }, null, 2)
  );
  const [docJson, setDocJson] = useState(
    JSON.stringify(initial?.documentation ?? { requiredPhotos: [], gpsRequired: true, signatureRequired: false }, null, 2)
  );

  const create = usePkbCreate<WorkPackage>("work-packages");
  const update = usePkbUpdate<WorkPackage>("work-packages");
  const isPending = create.isPending || update.isPending;

  function set(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function parseJson(str: string, fallback: any) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      expectedWork: parseJson(expectedWorkJson, []),
      billing: parseJson(billingJson, { requiredCodes: [] }),
      documentation: parseJson(docJson, { requiredPhotos: [] }),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: initial!.id, data: payload });
        toast({ title: "Work Package updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Work Package created" });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight">
            {isEdit ? "Edit Work Package" : "New Work Package"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="font-bold text-sm">Package Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. 45ft Class 3 Three-Phase Pole Replacement" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Code *</Label>
              <Input value={form.code} onChange={e => set("code", e.target.value)} placeholder="e.g. WP-3PH-45C3-REPL" required />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Customer / Utility</Label>
              <Input value={form.customerId ?? ""} onChange={e => set("customerId", e.target.value)} placeholder="e.g. Red River Electric" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Access Type</Label>
              <Select value={form.accessType ?? ""} onValueChange={v => set("accessType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["roadside", "backyard", "wetlands", "steep_terrain", "other"].map(v => (
                    <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Pole Material</Label>
              <Select value={form.poleMaterial ?? ""} onValueChange={v => set("poleMaterial", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["wood", "steel", "concrete", "composite"].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Nominal Height (ft)</Label>
              <Input value={form.poleHeight ?? ""} onChange={e => set("poleHeight", e.target.value)} placeholder="e.g. 45" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Pole Class</Label>
              <Select value={form.poleClass ?? ""} onValueChange={v => set("poleClass", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {["1","2","3","4","5","H1","H2"].map(v => (
                    <SelectItem key={v} value={v}>Class {v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Status</Label>
              <Select value={form.versionStatus} onValueChange={v => set("versionStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","active","archived"].map(v => (
                    <SelectItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Expected Work (JSON)</Label>
            <Textarea
              value={expectedWorkJson}
              onChange={e => setExpectedWorkJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='[{"workActionCode":"WA-POLE-INST","type":"required","defaultQty":1}]'
            />
            <p className="text-xs text-muted-foreground">Array of work action references. Fields: workActionCode, type (required/optional), defaultQty.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Billing (JSON)</Label>
            <Textarea
              value={billingJson}
              onChange={e => setBillingJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='{"requiredCodes":[{"code":"RRE-POLE-SET-45C3","description":"Pole Set","unitType":"each","minCharge":1}]}'
            />
            <p className="text-xs text-muted-foreground">requiredCodes: code, description, unitType, minCharge.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="font-bold text-sm">Documentation / Required Photos (JSON)</Label>
            <Textarea
              value={docJson}
              onChange={e => setDocJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='{"requiredPhotos":[{"category":"full_pole","label":"Full Pole","required":true}],"gpsRequired":true,"signatureRequired":false}'
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="font-bold">Cancel</Button>
            <Button type="submit" className="font-bold gap-2" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Work Package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main section ─────────────────────────────────────────────────────────────
export function SectionWorkPackages() {
  const { activeCompanyId } = useCompanyStore();
  const { toast } = useToast();
  const { data, isLoading } = usePkbList<WorkPackage>("work-packages", activeCompanyId ?? undefined);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkPackage | undefined>();

  const del = usePkbDelete("work-packages");
  const activate = usePkbActivate("work-packages");
  const update = usePkbUpdate<WorkPackage>("work-packages");
  const duplicate = usePkbDuplicate<WorkPackage>("work-packages");

  const filtered = (data ?? []).filter(wp => {
    if (!search) return true;
    const q = search.toLowerCase();
    return wp.name.toLowerCase().includes(q) || (wp.code ?? "").toLowerCase().includes(q) || (wp.customerId ?? "").toLowerCase().includes(q);
  });

  async function handleToggleActive(wp: WorkPackage) {
    try {
      if (wp.isActive) { await update.mutateAsync({ id: wp.id, data: { isActive: false } }); toast({ title: "Work Package deactivated" }); }
      else { await activate.mutateAsync(wp.id); toast({ title: "Work Package activated" }); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDelete(wp: WorkPackage) {
    if (!confirm(`Delete "${wp.name}"?`)) return;
    try { await del.mutateAsync(wp.id); toast({ title: "Work Package deleted" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function handleDuplicate(id: number) {
    try { await duplicate.mutateAsync(id); toast({ title: "Work Package duplicated" }); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight">Work Packages</h2>
          <p className="text-muted-foreground font-medium text-sm mt-0.5">
            {filtered.length} of {(data ?? []).length} packages — click a row to expand details
          </p>
        </div>
        <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }} className="font-bold gap-2 uppercase tracking-wide">
          <Plus className="h-4 w-4" /> Add Work Package
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work packages…" className="pl-9 text-sm" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          {search ? `No work packages match "${search}"` : "No work packages yet — add the first one above."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="px-4 py-3 w-8" />
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Package</th>
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Pole Spec</th>
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Access</th>
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Contents</th>
                <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(wp => (
                <WorkPackageRow
                  key={wp.id}
                  wp={wp}
                  onEdit={w => { setEditing(w); setDialogOpen(true); }}
                  onDuplicate={handleDuplicate}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3 mt-4">
        {filtered.map(wp => (
          <div key={wp.id} className={cn("border border-border rounded-xl p-4 bg-card space-y-2", !wp.isActive && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm">{wp.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{wp.code}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <StatusBadge status={wp.versionStatus} isActive={wp.isActive} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditing(wp); setDialogOpen(true); }}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(wp.id)}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleToggleActive(wp)}>
                      {wp.isActive ? <><PowerOff className="h-4 w-4 mr-2" /> Deactivate</> : <><Zap className="h-4 w-4 mr-2" /> Activate</>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(wp)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">{(wp.expectedWork ?? []).length} actions</Badge>
              <BillingCodesBadge billing={wp.billing} />
              <RequiredPhotosBadge doc={wp.documentation} />
            </div>
          </div>
        ))}
      </div>

      <WorkPackageForm
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(undefined); }}
        initial={editing}
      />
    </>
  );
}
