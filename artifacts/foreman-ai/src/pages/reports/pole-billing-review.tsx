import { AlertTriangle, Loader2, ReceiptText, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/use-api";
import { availableRateOptions, type PoleBillingRateOptions } from "@/lib/pole-billing-review";

interface PoleBillingSuggestion {
  state: "review_required";
  canApply: false;
  billableItem: {
    id: number;
    category: string;
    name: string;
    billingCode: string | null;
    customer: string | null;
    unitType: string | null;
  };
  quantity: number;
  rateOptions: PoleBillingRateOptions;
  selectedRate: null;
  estimatedAmount: null;
  source: { factId: number; photoId: number; analysisVersion: number };
}

interface PoleBillingConflict {
  code: string;
  billableItemId: number | null;
  factIds: number[];
  message: string;
}

interface PoleBillingReviewResponse {
  reviewRequired: true;
  canApply: false;
  suggestions: PoleBillingSuggestion[];
  conflicts: PoleBillingConflict[];
}

function displayRate(value: string) {
  return `$${Number(value).toFixed(2)}`;
}

export default function PoleBillingReview({ reportId }: { reportId: number }) {
  const { data, isLoading, isError } = useApiQuery<PoleBillingReviewResponse>(
    `/api/reports/${reportId}/pole-billing-suggestions`,
    reportId > 0,
  );

  if (isLoading) {
    return <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking billing suggestions…</div>;
  }
  if (isError) {
    return (
      <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Billing suggestions could not be loaded. Review charges manually.
      </div>
    );
  }

  const suggestions = data?.suggestions ?? [];
  const conflicts = data?.conflicts ?? [];
  return (
    <Card className="overflow-hidden border-primary/40">
      <CardHeader className="space-y-2 bg-primary/[0.04] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base font-extrabold">
            <ReceiptText className="h-5 w-5 shrink-0 text-primary" /> Pole billing review
          </CardTitle>
          <Badge variant="outline">Human review required</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Rate and charge selection stay with an authorized reviewer. AI cannot apply, approve, or bill these items.</p>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-5">
        {conflicts.length > 0 && (
          <div className="space-y-2" aria-label="Billing conflicts">
            {conflicts.map((conflict, index) => (
              <div key={`${conflict.code}-${conflict.billableItemId ?? "unknown"}-${index}`} className="flex min-w-0 gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700 dark:text-yellow-400" />
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold">Needs manual resolution</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{conflict.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {suggestions.length === 0 && conflicts.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No reviewable pole billing suggestions are available. Enter and verify charges manually.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestions.map(suggestion => {
            const rates = availableRateOptions(suggestion.rateOptions);
            const unsafeFinalization = suggestion.canApply !== false
              || suggestion.selectedRate !== null || suggestion.estimatedAmount !== null;
            if (unsafeFinalization) {
              return (
                <div key={suggestion.source.factId} className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Unsafe billing response blocked. Review manually.
                </div>
              );
            }
            return (
              <div key={suggestion.source.factId} className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-extrabold">{suggestion.billableItem.name}</p>
                    <p className="break-words text-xs text-muted-foreground">{suggestion.billableItem.billingCode || suggestion.billableItem.category}</p>
                  </div>
                  <Badge variant="secondary">Review only</Badge>
                </div>
                <p className="mt-3 text-sm"><span className="font-bold">Confirmed quantity:</span> {suggestion.quantity} {suggestion.billableItem.unitType || "units"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rates.map(rate => <Badge key={rate.key} variant="outline">{rate.label}: {displayRate(rate.value)}</Badge>)}
                  {rates.length === 0 && <span className="text-xs font-medium text-destructive">No active rate option</span>}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Source photo #{suggestion.source.photoId} · analysis v{suggestion.source.analysisVersion}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
