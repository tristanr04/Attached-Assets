import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useGetReport, getGetReportQueryKey, useUpdateReport, useCompleteReport, useListProjects, useListCrews } from "@workspace/api-client-react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ArrowRight, Save, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import StepBasics from "./steps/step-basics";
import StepHours from "./steps/step-hours";
import StepMaterials from "./steps/step-materials";
import StepEquipment from "./steps/step-equipment";
import StepPhotos from "./steps/step-photos";
import StepSummary from "./steps/step-summary";
import StepReview from "./steps/step-review";

const STEPS = [
  { id: 'basics', title: 'Basics' },
  { id: 'hours', title: 'Hours' },
  { id: 'materials', title: 'Materials' },
  { id: 'equipment', title: 'Equipment' },
  { id: 'photos', title: 'Photos' },
  { id: 'summary', title: 'Summary' },
  { id: 'review', title: 'Review & Sign' },
];

export default function ReportEditPage({ id }: { id: number }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const { activeCompanyId } = useCompanyStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useGetReport(id, {
    query: {
      enabled: !!id,
      queryKey: getGetReportQueryKey(id)
    }
  });

  const completeReport = useCompleteReport();

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleComplete = () => {
    completeReport.mutate({
      reportId: id
    }, {
      onSuccess: () => {
        toast({
          title: "Report completed",
          description: "Your report has been submitted successfully."
        });
        queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        setLocation(`/reports/${id}`);
      },
      onError: (err) => {
        toast({
          title: "Failed to complete report",
          description: String(err),
          variant: "destructive"
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) return <div>Report not found</div>;
  if (report.status === 'complete') {
    // Cannot edit complete reports
    setLocation(`/reports/${id}`);
    return null;
  }

  const CurrentStepComponent = [
    StepBasics,
    StepHours,
    StepMaterials,
    StepEquipment,
    StepPhotos,
    StepSummary,
    StepReview
  ][currentStepIndex];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight uppercase">Draft Report</h1>
          <p className="text-muted-foreground font-medium mt-1">Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/reports/${id}`}>
            <Button variant="outline" className="font-bold">Exit Editor</Button>
          </Link>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((step, idx) => (
          <div 
            key={step.id}
            className={`h-2 flex-1 rounded-full ${
              idx <= currentStepIndex ? 'bg-primary' : 'bg-secondary'
            }`}
          />
        ))}
      </div>

      <Card className="border-border shadow-xl">
        <CardContent className="p-0">
          <CurrentStepComponent report={report} />
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-card border-t border-border p-4 px-6 flex justify-between items-center z-50">
        <Button 
          variant="outline" 
          onClick={handlePrev} 
          disabled={currentStepIndex === 0}
          className="font-bold gap-2 w-32"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {currentStepIndex < STEPS.length - 1 ? (
          <Button 
            onClick={handleNext}
            className="font-bold gap-2 w-32"
          >
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button 
            onClick={handleComplete}
            disabled={completeReport.isPending}
            className="font-bold gap-2 bg-green-500 hover:bg-green-600 text-white w-48"
          >
            {completeReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Submit Report
          </Button>
        )}
      </div>
    </div>
  );
}
