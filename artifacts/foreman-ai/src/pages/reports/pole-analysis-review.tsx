import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Loader2, Pencil, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { requestJson } from "@/lib/report-initialization";
import {
  buildPoleConfirmationKey,
  displayPoleValue,
  parseEditedPoleValue,
  reviewedFieldCount,
  type PoleDecisionAction,
} from "@/lib/pole-analysis-review";

interface Evidence {
  kind: string;
  detail: string;
}

interface AnalysisField {
  key: string;
  proposedValue: unknown;
  confidence: number;
  evidence: Evidence[];
  reviewRequirement: string;
  additionalPhotoRequest: string | null;
}

interface PoleAnalysisReview {
  analysisRunId: number;
  analysisId: string;
  version: number;
  status: string;
  targetMatch: string;
  fields: AnalysisField[];
  limitations: string[];
  confirmedAt: string | null;
  canConfirm: boolean;
}

interface DecisionDraft {
  action: PoleDecisionAction;
  editedValue?: string;
}

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

function confidenceTone(confidence: number) {
  if (confidence >= 0.85) return "text-green-700 dark:text-green-400";
  if (confidence >= 0.7) return "text-yellow-700 dark:text-yellow-400";
  return "text-destructive";
}

export default function PoleAnalysisReviewCard({
  reportId,
  photo,
  locked,
}: {
  reportId: number;
  photo: { id: number; url: string; caption: string | null };
  locked: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const endpoint = `/api/reports/${reportId}/photos/${photo.id}/pole-analysis`;
  const queryKey = [`${baseUrl}${endpoint}`];
  const [decisions, setDecisions] = useState<Record<string, DecisionDraft | undefined>>({});

  const { data, isLoading, isError } = useQuery<{ analysis: PoleAnalysisReview | null }>({
    queryKey,
    queryFn: () => requestJson(fetch, `${baseUrl}${endpoint}`),
  });
  const analysis = data?.analysis ?? null;
  const reviewed = reviewedFieldCount(analysis?.fields.map(field => field.key) ?? [], decisions);
  const allReviewed = Boolean(analysis?.fields.length) && reviewed === analysis!.fields.length;

  const retryKey = useMemo(() => {
    if (!analysis) return null;
    const storageKey = `redline:pole-confirm:${analysis.analysisRunId}:${analysis.version}`;
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const nonce = window.crypto.randomUUID();
    const created = buildPoleConfirmationKey(analysis.analysisRunId, analysis.version, nonce);
    window.localStorage.setItem(storageKey, created);
    return created;
  }, [analysis?.analysisRunId, analysis?.version]);

  const confirm = useMutation({
    mutationFn: async () => {
      if (!analysis || !retryKey || !allReviewed) throw new Error("Review every field before confirmation");
      return requestJson(fetch, `${baseUrl}${endpoint}/${analysis.analysisRunId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": retryKey },
        body: JSON.stringify({
          expectedVersion: analysis.version,
          decisions: analysis.fields.map(field => {
            const decision = decisions[field.key]!;
            return {
              fieldKey: field.key,
              action: decision.action,
              ...(decision.action === "edit" ? { editedValue: parseEditedPoleValue(decision.editedValue ?? "") } : {}),
            };
          }),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Pole analysis confirmed", description: "Your field-by-field decisions were saved to the audit history." });
    },
    onError: error => toast({ title: "Could not confirm analysis", description: String(error), variant: "destructive" }),
  });

  if (isLoading) return <div className="px-3 pb-3 text-xs text-muted-foreground">Checking for pole analysis…</div>;
  if (isError) return <div className="px-3 pb-3 text-xs text-destructive">Analysis status could not be loaded. Retry when connected.</div>;
  if (!analysis) return null;

  if (analysis.status === "foreman_confirmed") {
    return (
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm font-bold text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Pole analysis confirmed
      </div>
    );
  }

  return (
    <Card className="mx-3 mb-3 overflow-hidden border-primary/50 bg-primary/[0.03]">
      <CardContent className="p-3 sm:p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-extrabold">AI-proposed pole fields</p>
            <p className="text-xs text-muted-foreground">Foreman decision required for every field. AI cannot finalize this report.</p>
          </div>
          <Badge variant="outline">{reviewed}/{analysis.fields.length} reviewed</Badge>
        </div>

        {analysis.targetMatch !== "confirmed" && (
          <div className="mb-4 flex gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The pole/job match is {analysis.targetMatch}. Select the correct target or provide the requested photo before confirmation.</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="min-w-0">
            <img src={photo.url} alt={photo.caption || "Source pole"} className="max-h-80 w-full rounded-lg bg-black object-contain" />
            <p className="mt-2 text-xs text-muted-foreground">Original saved source photo</p>
          </div>

          <div className="min-w-0 space-y-3">
            {analysis.fields.map(field => {
              const decision = decisions[field.key];
              return (
                <div key={field.key} className="min-w-0 rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="break-words text-sm font-bold">{field.key}</p>
                    <span className={`text-xs font-bold ${confidenceTone(field.confidence)}`}>{Math.round(field.confidence * 100)}% confidence</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{displayPoleValue(field.proposedValue)}</pre>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {field.evidence.map((item, index) => <p key={`${item.kind}-${index}`}>• {item.detail}</p>)}
                  </div>
                  {field.additionalPhotoRequest && (
                    <p className="mt-2 rounded bg-yellow-500/10 p-2 text-xs font-medium text-yellow-800 dark:text-yellow-300">Needed: {field.additionalPhotoRequest}</p>
                  )}
                  {decision?.action === "edit" && (
                    <Textarea
                      aria-label={`Edited value for ${field.key}`}
                      className="mt-3 min-h-20"
                      value={decision.editedValue ?? displayPoleValue(field.proposedValue)}
                      onChange={event => setDecisions(current => ({ ...current, [field.key]: { action: "edit", editedValue: event.target.value } }))}
                    />
                  )}
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Decision for ${field.key}`}>
                    <Button type="button" size="sm" variant={decision?.action === "accept" ? "default" : "outline"} className="h-11 flex-1 gap-1" onClick={() => setDecisions(current => ({ ...current, [field.key]: { action: "accept" } }))} disabled={locked || !analysis.canConfirm}>
                      <Check className="h-4 w-4" /> Accept
                    </Button>
                    <Button type="button" size="sm" variant={decision?.action === "edit" ? "default" : "outline"} className="h-11 flex-1 gap-1" onClick={() => setDecisions(current => ({ ...current, [field.key]: { action: "edit", editedValue: displayPoleValue(field.proposedValue) } }))} disabled={locked || !analysis.canConfirm}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button type="button" size="sm" variant={decision?.action === "reject" ? "destructive" : "outline"} className="h-11 flex-1 gap-1" onClick={() => setDecisions(current => ({ ...current, [field.key]: { action: "reject" } }))} disabled={locked || !analysis.canConfirm}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!analysis.canConfirm && <p className="mt-4 text-xs font-medium text-muted-foreground">Only the report's assigned foreman can record these decisions.</p>}
        <Button className="mt-4 h-12 w-full font-bold" onClick={() => confirm.mutate()} disabled={!allReviewed || locked || !analysis.canConfirm || confirm.isPending || analysis.targetMatch !== "confirmed"}>
          {confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Confirm Pole Analysis
        </Button>
      </CardContent>
    </Card>
  );
}
