import { useRef, useState, type ReactNode } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useCreateReport, getListReportsQueryKey } from "@workspace/api-client-react";
import { useApiQuery } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Copy, ClipboardList, ChevronRight, FileText } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  buildInitializationKey,
  requestJson,
  type ReportSummary,
} from "@/lib/report-initialization";

interface ReportTemplateSummary {
  id: number;
  name: string;
  description: string | null;
}

interface InitializationActionProps {
  title: string;
  description: string;
  icon: ReactNode;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function InitializationAction({
  title,
  description,
  icon,
  loading,
  disabled = false,
  onClick,
}: InitializationActionProps) {
  return (
    <button
      type="button"
      className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
    >
      <Card className="transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]">
        <CardContent className="flex min-h-24 items-center justify-between gap-3 p-4 sm:p-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-14 sm:w-14">
              {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold uppercase tracking-wide sm:text-xl">{title}</h3>
              <p className="text-sm font-medium text-muted-foreground">{description}</p>
            </div>
          </div>
          <ChevronRight className="h-6 w-6 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </button>
  );
}

export default function ReportCreatePage() {
  const { activeCompanyId } = useCompanyStore();
  const createReport = useCreateReport();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isInitializing, setIsInitializing] = useState<string | null>(null);
  const inFlight = useRef(false);
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: templates = [] } = useApiQuery<ReportTemplateSummary[]>(
    `/api/report-templates?companyId=${activeCompanyId}`,
    !!activeCompanyId,
  );

  const getTemplateRetryKey = (reportDate: string, templateId: number) => {
    const storageKey = `redline:initialize:${activeCompanyId}:${reportDate}:template:${templateId}`;
    let existing: string | null = null;
    try {
      existing = sessionStorage.getItem(storageKey);
    } catch {
      // Storage can be unavailable in hardened/private browser modes.
    }
    if (existing) return existing;

    const nonce = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const key = buildInitializationKey(
      "template",
      reportDate,
      templateId,
      nonce,
    );
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      // The in-flight request still has duplicate protection without storage.
    }
    return key;
  };

  const finishInitialization = async (reportId: number) => {
    await queryClient.invalidateQueries({
      queryKey: getListReportsQueryKey({ companyId: activeCompanyId! }),
    });
    setLocation(`/reports/${reportId}/edit`);
  };

  const initializeDraft = async (
    mode: "blank" | "copy-yesterday" | "template",
    templateId?: number,
  ) => {
    if (!activeCompanyId || inFlight.current) return;

    const actionId = mode === "template" ? `template-${templateId}` : mode;
    const today = format(new Date(), "yyyy-MM-dd");
    inFlight.current = true;
    setIsInitializing(actionId);

    try {
      if (mode === "copy-yesterday") {
        const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
        const sourceReports = await requestJson<ReportSummary[]>(
          fetch,
          `${baseUrl}/api/reports?companyId=${activeCompanyId}&reportDate=${yesterday}&limit=1`,
        );
        const source = sourceReports[0];
        if (!source) {
          throw new Error("No report exists for yesterday. Start blank instead.");
        }

        const copied = await requestJson<ReportSummary>(
          fetch,
          `${baseUrl}/api/reports/${source.id}/copy`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportDate: today }),
          },
        );
        await finishInitialization(copied.id);
        return;
      }

      const report = await createReport.mutateAsync({
        data: { companyId: activeCompanyId, reportDate: today },
      });

      if (mode === "template") {
        if (!templateId) throw new Error("Select a valid template.");
        const idempotencyKey = getTemplateRetryKey(today, templateId);
        await requestJson(
          fetch,
          `${baseUrl}/api/report-templates/${templateId}/apply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({ reportId: report.id }),
          },
        );
      }

      await finishInitialization(report.id);
    } catch (error) {
      toast({
        title: "Could not start report",
        description: error instanceof Error ? error.message : "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      inFlight.current = false;
      setIsInitializing(null);
    }
  };

  const busy = isInitializing !== null;

  return (
    <div className="space-y-6 pb-12 md:space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight md:text-4xl">New Report</h1>
        <p className="mt-1 text-base font-medium text-muted-foreground md:text-lg">Start today&apos;s daily log</p>
      </div>

      <div className="grid max-w-2xl grid-cols-1 gap-4">
        <InitializationAction
          title="Start Blank"
          description="New empty report for today"
          icon={<Plus className="h-7 w-7" />}
          loading={isInitializing === "blank"}
          disabled={busy}
          onClick={() => void initializeDraft("blank")}
        />

        <InitializationAction
          title="Copy Yesterday"
          description="Clone yesterday's crew, equipment, and materials"
          icon={<Copy className="h-7 w-7" />}
          loading={isInitializing === "copy-yesterday"}
          disabled={busy}
          onClick={() => void initializeDraft("copy-yesterday")}
        />

        <InitializationAction
          title="Use Crew Defaults"
          description="Available after crew defaults are configured"
          icon={<ClipboardList className="h-7 w-7" />}
          loading={false}
          disabled
          onClick={() => undefined}
        />

        {templates.length > 0 && (
          <div className="mt-4 sm:mt-8">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-muted-foreground">Saved Templates</h2>
            <div className="grid grid-cols-1 gap-3">
              {templates.map((template) => (
                <InitializationAction
                  key={template.id}
                  title={template.name}
                  description={template.description || "Start today with this saved template"}
                  icon={<FileText className="h-6 w-6" />}
                  loading={isInitializing === `template-${template.id}`}
                  disabled={busy}
                  onClick={() => void initializeDraft("template", template.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
