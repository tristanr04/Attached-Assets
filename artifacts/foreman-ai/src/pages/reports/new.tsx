import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useCreateReport, getListReportsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

// Initial skeleton for new report
export default function ReportCreatePage() {
  const { activeCompanyId } = useCompanyStore();
  const createReport = useCreateReport();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isInitializing, setIsInitializing] = useState(false);

  // Auto-initialize a draft and redirect to edit
  const initializeDraft = () => {
    setIsInitializing(true);
    createReport.mutate({
      data: {
        companyId: activeCompanyId!,
        reportDate: format(new Date(), 'yyyy-MM-dd')
      }
    }, {
      onSuccess: (report) => {
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey({ companyId: activeCompanyId! }) });
        setLocation(`/reports/${report.id}`);
      },
      onSettled: () => setIsInitializing(false)
    });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="w-full max-w-md border-border shadow-xl text-center">
        <CardHeader>
          <CardTitle className="text-2xl font-bold uppercase tracking-wide">New Daily Report</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-6">
          <p className="text-muted-foreground text-lg">Create a new draft for today's work.</p>
          <Button 
            size="lg" 
            className="h-16 text-lg uppercase tracking-wide font-bold w-full"
            onClick={initializeDraft}
            disabled={isInitializing}
          >
            {isInitializing ? (
              <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Preparing Draft...</>
            ) : (
              "Start Draft"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
