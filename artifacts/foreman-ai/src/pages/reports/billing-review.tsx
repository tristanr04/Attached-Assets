/**
 * Billing Review page — Tasks #26, #27, #28
 * Shows AI-generated billing suggestions, allows supervisor review/edit,
 * and displays validation findings for a submitted report.
 *
 * Route: /reports/:id/billing
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetReport, getGetReportQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Sparkles, ShieldCheck, CheckCircle2, AlertCircle, Info,
  Loader2, Pencil, Trash2, Plus, RefreshCcw, ThumbsUp, RotateCcw,
  DollarSign, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface BillingItem {
  billingCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate?: number | null;
  subtotal?: number | null;
  source?: string;
  confidence?: number;
  notes?: string;
}

interface BillingSuggestion {
  id: number;
  reportId: number;
  workPackageId?: number | null;
  suggestedItems: BillingItem[] | null;
  reviewerEdits: BillingItem[] | null;
  status: "pending_review" | "approved" | "rejected" | "returned_to_foreman";
  approvedAt?: string | null;
  returnNote?: string | null;
  createdAt: string;
}

interface ValidationFinding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  suggestedAction?: string;
  relatedBillingCodes?: string[];
  ruleId?: number;
}

interface BillingValidation {
  id: number;
  status: "clean" | "warnings" | "errors";
  findings: ValidationFinding[];
  acknowledgements: Array<{ findingCode: string; note?: string; acknowledgedBy: number; acknowledgedAt: string }>;
  triggeredAt: string;
}

// ── Small components ──────────────────────────────────────────────────────────
function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (severity === "warning") return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  return (
    <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5",
      pct >= 80 ? "border-green-500 text-green-600" :
      pct >= 50 ? "border-yellow-500 text-yellow-600" :
      "border-red-400 text-red-500"
    )}>
      {pct}% AI
    </Badge>
  );
}

function StatusBadge({ status }: { status: BillingSuggestion["status"] }) {
  const cfg: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending_review: { label: "Pending Review", variant: "secondary" },
    approved:       { label: "Approved",       variant: "default" },
    rejected:       { label: "Rejected",       variant: "destructive" },
    returned_to_foreman: { label: "Returned",  variant: "outline" },
  };
  const c = cfg[status] ?? cfg.pending_review;
  return <Badge variant={c.variant} className="font-bold">{c.label}</Badge>;
}

// ── Billing item row ──────────────────────────────────────────────────────────
function ItemRow({
  item, onEdit, onDelete, locked,
}: {
  item: BillingItem;
  onEdit: () => void;
  onDelete: () => void;
  locked: boolean;
}) {
  const subtotal = item.subtotal ?? (item.unitRate != null ? item.quantity * item.unitRate : null);
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-primary">{item.billingCode}</span>
          <ConfidenceBadge confidence={item.confidence} />
          {item.source === "work_package" && <Badge variant="outline" className="text-[9px] h-4">WP</Badge>}
          {item.source === "rule_match" && <Badge variant="outline" className="text-[9px] h-4">Rule</Badge>}
        </div>
        <p className="text-sm mt-0.5">{item.description}</p>
        {item.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{item.notes}</p>}
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-sm font-bold tabular-nums">
          {item.quantity} {item.unit}
          {item.unitRate != null && <span className="text-muted-foreground font-normal ml-1">@ ${item.unitRate.toFixed(2)}</span>}
        </p>
        {subtotal != null && (
          <p className="text-sm font-extrabold text-primary">${subtotal.toFixed(2)}</p>
        )}
      </div>
      {!locked && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

// ── Edit item dialog ──────────────────────────────────────────────────────────
function ItemEditDialog({
  item, onSave, onClose,
}: {
  item: Partial<BillingItem>;
  onSave: (item: BillingItem) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<BillingItem>({
    billingCode: item.billingCode ?? "",
    description: item.description ?? "",
    quantity: item.quantity ?? 1,
    unit: item.unit ?? "EA",
    unitRate: item.unitRate ?? null,
    subtotal: item.subtotal ?? null,
    source: item.source ?? "manual",
    confidence: item.confidence,
    notes: item.notes ?? "",
  });

  function set<K extends keyof BillingItem>(key: K, val: BillingItem[K]) {
    setForm(p => ({ ...p, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subtotal = form.unitRate != null ? form.quantity * form.unitRate : null;
    onSave({ ...form, subtotal });
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight">
            {item.billingCode ? "Edit Line Item" : "Add Line Item"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-wider">Billing Code *</Label>
              <Input value={form.billingCode} onChange={e => set("billingCode", e.target.value)} required placeholder="e.g. ST-XARM-3P" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-wider">Unit</Label>
              <select
                value={form.unit}
                onChange={e => set("unit", e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {["EA","HR","LF","CY","LS","FT","TON"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider">Description *</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} required placeholder="Line item description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-wider">Quantity</Label>
              <Input type="number" min={0.01} step={0.01} value={form.quantity} onChange={e => set("quantity", parseFloat(e.target.value) || 1)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-wider">Unit Rate ($)</Label>
              <Input type="number" min={0} step={0.01} placeholder="Optional" value={form.unitRate ?? ""} onChange={e => set("unitRate", e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider">Notes</Label>
            <Input value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} placeholder="Optional notes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="font-bold">Cancel</Button>
            <Button type="submit" className="font-bold">Save Item</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BillingReviewPage({ id }: { id: number }) {
  const { activeCompanyId } = useCompanyStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingItem, setEditingItem] = useState<{ item: Partial<BillingItem>; index: number } | null>(null);
  const [returnNoteDialog, setReturnNoteDialog] = useState(false);
  const [returnNote, setReturnNote] = useState("");

  const { data: report } = useGetReport(id, { query: { queryKey: getGetReportQueryKey(id) } });

  const { data: suggestion, isLoading: sugLoading } = useQuery<BillingSuggestion | null>({
    queryKey: ["billing-suggestion", id],
    queryFn: () => fetch(`${BASE()}/api/reports/${id}/billing-suggestions`).then(r => r.ok ? r.json() : null),
    enabled: !!id,
  });

  const { data: validation, isLoading: valLoading } = useQuery<BillingValidation | null>({
    queryKey: ["billing-validation", id],
    queryFn: () => fetch(`${BASE()}/api/reports/${id}/billing-validation`).then(r => r.ok ? r.json() : null),
    enabled: !!id,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      fetch(`${BASE()}/api/reports/${id}/billing-suggestions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      }).then(r => { if (!r.ok) throw new Error("Generation failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-suggestion", id] });
      toast({ title: "Billing suggestions generated" });
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const validateMutation = useMutation({
    mutationFn: () =>
      fetch(`${BASE()}/api/reports/${id}/billing-validation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      }).then(r => { if (!r.ok) throw new Error("Validation failed"); return r.json(); }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["billing-validation", id] });
      const { findingCount, status } = data;
      toast({ title: `Validation complete — ${status}`, description: `${findingCount} finding(s)` });
    },
    onError: () => toast({ title: "Validation failed", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: (body: any) =>
      fetch(`${BASE()}/api/reports/${id}/billing-suggestions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, companyId: activeCompanyId }),
      }).then(r => { if (!r.ok) throw new Error("Save failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-suggestion", id] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // The editable items — start from reviewer edits, fall back to suggested
  const workingItems: BillingItem[] = (suggestion?.reviewerEdits ?? suggestion?.suggestedItems ?? []) as BillingItem[];
  const isLocked = suggestion?.status === "approved" || suggestion?.status === "rejected";

  const totalSubtotal = workingItems.reduce((s, i) => {
    const st = i.subtotal ?? (i.unitRate != null ? i.quantity * i.unitRate : 0);
    return s + st;
  }, 0);

  async function saveEdits(items: BillingItem[]) {
    await patchMutation.mutateAsync({ reviewerEdits: items });
  }

  async function handleApprove() {
    await patchMutation.mutateAsync({ status: "approved", reviewerEdits: workingItems });
    toast({ title: "Billing approved", description: "Report billing has been approved." });
    qc.invalidateQueries({ queryKey: ["billing-suggestion", id] });
  }

  async function handleReturn() {
    await patchMutation.mutateAsync({ status: "returned_to_foreman", returnNote });
    setReturnNoteDialog(false);
    setReturnNote("");
    toast({ title: "Returned to foreman" });
  }

  async function handleAcknowledge(findingCode: string) {
    await fetch(`${BASE()}/api/reports/${id}/billing-validation/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, findingCode }),
    });
    qc.invalidateQueries({ queryKey: ["billing-validation", id] });
    toast({ title: "Finding acknowledged" });
  }

  if (!report) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const ackedCodes = new Set((validation?.acknowledgements ?? []).map(a => a.findingCode));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      {/* Edit item dialog */}
      {editingItem && (
        <ItemEditDialog
          item={editingItem.item}
          onClose={() => setEditingItem(null)}
          onSave={(saved) => {
            const updated = [...workingItems];
            if (editingItem.index >= 0) updated[editingItem.index] = saved;
            else updated.push(saved);
            saveEdits(updated);
            setEditingItem(null);
          }}
        />
      )}

      {/* Return note dialog */}
      <Dialog open={returnNoteDialog} onOpenChange={setReturnNoteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-extrabold uppercase">Return to Foreman</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Explain what needs to be corrected before this report can be approved.</p>
            <Textarea
              value={returnNote}
              onChange={e => setReturnNote(e.target.value)}
              placeholder="e.g. Missing pole tag photo and work hours for Aug 5 are incomplete."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnNoteDialog(false)}>Cancel</Button>
            <Button variant="destructive" className="font-bold" onClick={handleReturn} disabled={!returnNote.trim()}>Return Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href={`/reports/${id}`}>
          <Button variant="ghost" size="icon" className="mt-1"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold tracking-tight uppercase">Billing Review</h1>
            {suggestion && <StatusBadge status={suggestion.status} />}
          </div>
          <p className="text-muted-foreground font-medium mt-1">
            Report #{id} — {report.reportDate}
            {report.workLocation && ` — ${report.workLocation}`}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="font-bold gap-2 uppercase tracking-wide"
          variant={suggestion ? "outline" : "default"}
        >
          {generateMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Sparkles className="h-4 w-4" />}
          {suggestion ? "Re-generate Suggestions" : "Generate AI Billing"}
        </Button>

        <Button
          onClick={() => validateMutation.mutate()}
          disabled={validateMutation.isPending}
          variant="outline"
          className="font-bold gap-2 uppercase tracking-wide"
        >
          {validateMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <ShieldCheck className="h-4 w-4" />}
          Run Validation
        </Button>

        {suggestion && suggestion.status === "pending_review" && (
          <>
            <Button
              onClick={handleApprove}
              disabled={patchMutation.isPending}
              className="font-bold gap-2 uppercase tracking-wide bg-green-500 hover:bg-green-600 text-white ml-auto"
            >
              {patchMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ThumbsUp className="h-4 w-4" />}
              Approve Billing
            </Button>
            <Button
              onClick={() => setReturnNoteDialog(true)}
              variant="outline"
              className="font-bold gap-2 uppercase tracking-wide border-yellow-400 text-yellow-600 hover:bg-yellow-50"
            >
              <RotateCcw className="h-4 w-4" /> Return to Foreman
            </Button>
          </>
        )}
      </div>

      {/* Validation findings */}
      {validation && (
        <Card className={cn("border-2", {
          "border-destructive": validation.status === "errors",
          "border-yellow-400": validation.status === "warnings",
          "border-green-400": validation.status === "clean",
        })}>
          <CardHeader className="pb-3">
            <CardTitle className="font-extrabold uppercase tracking-tight flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5" />
              Validation Results
              <Badge variant={validation.status === "clean" ? "default" : validation.status === "errors" ? "destructive" : "secondary"}
                className={cn("ml-auto", validation.status === "clean" && "bg-green-500")}>
                {validation.status === "clean" ? "Clean" : validation.status === "warnings" ? "Warnings" : "Errors"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {validation.findings.length === 0 ? (
              <p className="text-sm text-green-600 font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> No issues found.
              </p>
            ) : (
              validation.findings.map(f => (
                <div key={f.code} className={cn("flex items-start gap-3 p-3 rounded-lg border text-sm",
                  ackedCodes.has(f.code) ? "opacity-40" : ""
                )}>
                  <SeverityIcon severity={f.severity} />
                  <div className="flex-1">
                    <p className="font-bold">{f.message}</p>
                    {f.suggestedAction && <p className="text-muted-foreground mt-0.5">{f.suggestedAction}</p>}
                  </div>
                  {!ackedCodes.has(f.code) && (
                    <Button variant="ghost" size="sm" className="text-xs font-bold shrink-0 h-7" onClick={() => handleAcknowledge(f.code)}>
                      Ack
                    </Button>
                  )}
                  {ackedCodes.has(f.code) && (
                    <Badge variant="secondary" className="text-[9px] h-5 shrink-0">Acknowledged</Badge>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Billing line items */}
      <Card>
        <CardHeader>
          <CardTitle className="font-extrabold uppercase tracking-tight flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5" /> Billing Line Items
            {workingItems.length > 0 && (
              <span className="ml-auto text-sm font-extrabold text-primary">
                Total: ${totalSubtotal.toFixed(2)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sugLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : workingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-4 border border-dashed border-border rounded-xl">
              <FileText className="h-12 w-12 opacity-20" />
              <div>
                <p className="font-bold text-base">No billing items yet</p>
                <p className="text-sm text-muted-foreground mt-1">Click "Generate AI Billing" to auto-generate line items from the report.</p>
              </div>
              <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="font-bold gap-2">
                {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Now
              </Button>
            </div>
          ) : (
            <div>
              {workingItems.map((item, i) => (
                <ItemRow
                  key={`${item.billingCode}-${i}`}
                  item={item}
                  locked={isLocked}
                  onEdit={() => setEditingItem({ item, index: i })}
                  onDelete={() => {
                    const updated = workingItems.filter((_, idx) => idx !== i);
                    saveEdits(updated);
                  }}
                />
              ))}

              {/* Total row */}
              {totalSubtotal > 0 && (
                <div className="flex justify-between items-center pt-3 mt-3 border-t border-border">
                  <span className="font-bold uppercase tracking-wide text-sm text-muted-foreground">Total</span>
                  <span className="font-extrabold text-xl text-primary">${totalSubtotal.toFixed(2)}</span>
                </div>
              )}

              {!isLocked && (
                <Button
                  variant="outline"
                  className="w-full mt-4 font-bold gap-2 border-dashed"
                  onClick={() => setEditingItem({ item: {}, index: -1 })}
                >
                  <Plus className="h-4 w-4" /> Add Line Item
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return note display */}
      {suggestion?.returnNote && (
        <Card className="border-yellow-400 bg-yellow-500/5">
          <CardContent className="p-4 flex gap-3">
            <RotateCcw className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Returned by Supervisor</p>
              <p className="text-sm text-muted-foreground mt-1">{suggestion.returnNote}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
