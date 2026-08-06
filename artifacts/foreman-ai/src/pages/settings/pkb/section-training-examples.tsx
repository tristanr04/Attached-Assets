/**
 * Training Examples — Task #29
 * Expert-reviewed pole analysis examples used to validate and improve
 * the AI vision model. Each example has a status: pending_review → verified | rejected.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyStore } from "@/hooks/use-company-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Loader2,
  GraduationCap, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface TrainingExample {
  id: number;
  companyId: number;
  structureConfigCode: string | null;
  aiAnalysis: any;
  expertCorrection: any;
  status: "pending_review" | "verified" | "rejected";
  notes: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: TrainingExample["status"] }) {
  const cfg = {
    pending_review: { label: "Pending Review", icon: Clock,          cls: "bg-yellow-500/10 text-yellow-600 border-yellow-400/40" },
    verified:       { label: "Verified",        icon: CheckCircle2,   cls: "bg-green-500/10 text-green-600 border-green-400/40" },
    rejected:       { label: "Rejected",        icon: XCircle,        cls: "bg-red-500/10 text-red-600 border-red-400/40" },
  };
  const c = cfg[status] ?? cfg.pending_review;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border", c.cls)}>
      <c.icon className="h-3 w-3" /> {c.label}
    </span>
  );
}

function JsonPretty({ data }: { data: any }) {
  if (!data) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <pre className="text-[11px] bg-secondary/40 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ExampleCard({ example, onUpdate }: { example: TrainingExample; onUpdate: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [correctionText, setCorrectionText] = useState(
    example.expertCorrection ? JSON.stringify(example.expertCorrection, null, 2) : ""
  );
  const [notes, setNotes] = useState(example.notes ?? "");

  const patch = useMutation({
    mutationFn: (body: any) =>
      fetch(`${BASE()}/api/pkb/training-examples/${example.id}?companyId=${example.companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => { onUpdate(); setEditing(false); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  function handleVerify() {
    let correction = null;
    try { correction = correctionText ? JSON.parse(correctionText) : null; } catch { /* use null */ }
    patch.mutate({ status: "verified", expertCorrection: correction, notes });
    toast({ title: "Marked as verified" });
  }

  function handleReject() {
    patch.mutate({ status: "rejected", notes });
    toast({ title: "Marked as rejected" });
  }

  const analysis = example.aiAnalysis as any;

  return (
    <Card className="border-border overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-sm">Example #{example.id}</span>
            {example.structureConfigCode && (
              <Badge variant="secondary" className="text-[10px]">{example.structureConfigCode}</Badge>
            )}
            <StatusBadge status={example.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Analyzed {new Date(example.createdAt).toLocaleDateString()} ·{" "}
            Confidence: {analysis?.confidence != null ? `${Math.round(analysis.confidence * 100)}%` : "—"} ·{" "}
            {analysis?.identifiedComponents?.length ?? 0} components
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <CardContent className="border-t border-border p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">AI Analysis</p>
              <JsonPretty data={example.aiAnalysis} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Expert Correction</p>
              {editing ? (
                <Textarea
                  value={correctionText}
                  onChange={e => setCorrectionText(e.target.value)}
                  placeholder='{"identifiedComponents": [...], ...}'
                  rows={8}
                  className="font-mono text-xs"
                />
              ) : (
                <JsonPretty data={example.expertCorrection} />
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Notes</p>
            {editing ? (
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Expert notes…" rows={2} />
            ) : (
              <p className="text-sm text-muted-foreground">{example.notes || "—"}</p>
            )}
          </div>

          {example.status === "pending_review" && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" className="font-bold gap-1.5" onClick={() => setEditing(v => !v)}>
                <Pencil className="h-3.5 w-3.5" /> {editing ? "Cancel Edit" : "Add Correction"}
              </Button>
              <Button size="sm" className="font-bold gap-1.5 bg-green-500 hover:bg-green-600 text-white" onClick={handleVerify} disabled={patch.isPending}>
                {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Verify
              </Button>
              <Button variant="outline" size="sm" className="font-bold gap-1.5 border-red-400 text-red-500 hover:bg-red-50" onClick={handleReject} disabled={patch.isPending}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function SectionTrainingExamples() {
  const { activeCompanyId } = useCompanyStore();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending_review");

  const { data: examples = [], isLoading } = useQuery<TrainingExample[]>({
    queryKey: ["pkb-training-examples", activeCompanyId, statusFilter],
    queryFn: () =>
      fetch(`${BASE()}/api/pkb/training-examples?companyId=${activeCompanyId}&status=${statusFilter}`)
        .then(r => r.ok ? r.json() : []),
    enabled: !!activeCompanyId,
  });

  const pending = (examples as TrainingExample[]).filter(e => e.status === "pending_review").length;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["pkb-training-examples", activeCompanyId] });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" /> Training Examples
          </h2>
          <p className="text-muted-foreground font-medium text-sm mt-0.5">
            Expert-reviewed AI analysis examples that improve pole recognition accuracy.
          </p>
        </div>
        {pending > 0 && (
          <Badge variant="destructive" className="text-sm font-bold px-3">{pending} pending review</Badge>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(["pending_review", "verified", "rejected"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn("text-xs font-bold px-3 py-1.5 rounded-full border transition-colors capitalize", 
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
            )}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (examples as TrainingExample[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-border rounded-xl text-muted-foreground">
          <GraduationCap className="h-12 w-12 opacity-20" />
          <div className="text-center">
            <p className="font-bold">No {statusFilter.replace("_", " ")} examples</p>
            <p className="text-sm mt-1">Examples are created automatically when photos are analyzed with AI.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {(examples as TrainingExample[]).map(ex => (
            <ExampleCard key={ex.id} example={ex} onUpdate={refresh} />
          ))}
        </div>
      )}
    </>
  );
}
