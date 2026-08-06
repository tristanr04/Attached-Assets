import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useCreateReport, getListReportsQueryKey } from "@workspace/api-client-react";
import { useApiQuery } from "@/hooks/use-api";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Copy, ClipboardList, ChevronRight, FileText } from "lucide-react";
import { format } from "date-fns";

export default function ReportCreatePage() {
  const { activeCompanyId } = useCompanyStore();
  const createReport = useCreateReport();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isInitializing, setIsInitializing] = useState<string | null>(null);

  const { data: templates = [] } = useApiQuery<any[]>(`/api/report-templates?companyId=${activeCompanyId}`, !!activeCompanyId);

  const initializeDraft = (mode: string, templateId?: number) => {
    setIsInitializing(mode);
    createReport.mutate({
      data: {
        companyId: activeCompanyId!,
        reportDate: format(new Date(), 'yyyy-MM-dd')
      }
    }, {
      onSuccess: async (report) => {
        // If mode === copy_yesterday, apply yesterday's template API call here
        // If mode === template, apply template API call here
        // For now, we mock the transition
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey({ companyId: activeCompanyId! }) });
        setLocation(`/reports/${report.id}`);
      },
      onSettled: () => setIsInitializing(null)
    });
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-12">
      <div className="flex flex-col justify-start">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">New Report</h1>
        <p className="text-muted-foreground font-medium text-base md:text-lg mt-1">Start today's daily log</p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-2xl">
        <Card 
          className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
          onClick={() => initializeDraft('blank')}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                {isInitializing === 'blank' ? <Loader2 className="w-7 h-7 animate-spin" /> : <Plus className="w-7 h-7" />}
              </div>
              <div>
                <h3 className="text-xl font-bold uppercase tracking-wide">Start Blank</h3>
                <p className="text-muted-foreground text-sm font-medium">New empty report for today</p>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground w-6 h-6" />
          </CardContent>
        </Card>

        <Card 
          className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
          onClick={() => initializeDraft('copy_yesterday')}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-secondary rounded-xl flex items-center justify-center">
                {isInitializing === 'copy_yesterday' ? <Loader2 className="w-7 h-7 animate-spin" /> : <Copy className="w-7 h-7" />}
              </div>
              <div>
                <h3 className="text-xl font-bold uppercase tracking-wide">Copy Yesterday</h3>
                <p className="text-muted-foreground text-sm font-medium">Clone employees, equipment, and tasks</p>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground w-6 h-6" />
          </CardContent>
        </Card>

        <Card 
          className="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
          onClick={() => initializeDraft('crew_defaults')}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-secondary rounded-xl flex items-center justify-center">
                {isInitializing === 'crew_defaults' ? <Loader2 className="w-7 h-7 animate-spin" /> : <ClipboardList className="w-7 h-7" />}
              </div>
              <div>
                <h3 className="text-xl font-bold uppercase tracking-wide">Use Crew Defaults</h3>
                <p className="text-muted-foreground text-sm font-medium">Load standard assigned crew & assets</p>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground w-6 h-6" />
          </CardContent>
        </Card>

        {templates.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Saved Templates</h3>
            <div className="grid grid-cols-1 gap-3">
              {templates.map(t => (
                <Card 
                  key={t.id}
                  className="hover:border-primary/50 cursor-pointer transition-all active:scale-[0.98]"
                  onClick={() => initializeDraft('template', t.id)}
                >
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center">
                        {isInitializing === `template-${t.id}` ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
                      </div>
                      <div>
                        <h4 className="font-bold">{t.name}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="text-muted-foreground w-5 h-5" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}