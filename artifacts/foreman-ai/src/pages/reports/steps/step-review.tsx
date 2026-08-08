import { type DailyReportDetail, useListTimeEntries, getListTimeEntriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import PoleBillingReview from "../pole-billing-review";

export default function StepReview({ report }: { report: DailyReportDetail }) {
  const queryClient = useQueryClient();
  const timeEntries = queryClient.getQueryData<any[]>(getListTimeEntriesQueryKey(report.id)) || [];
  
  // Basic signature pad for visual completeness
  const [signature, setSignature] = useState(false);

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="bg-primary/10 border-l-4 border-primary p-4 rounded-r-xl">
        <h3 className="font-bold flex items-center gap-2 text-primary">
          <CheckCircle2 className="h-5 w-5" /> Ready for Submission
        </h3>
        <p className="text-sm text-foreground mt-1">Review your data below. Once submitted, the report cannot be edited.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase text-muted-foreground border-b border-border pb-1 mb-2">Basics</h4>
            <div className="grid grid-cols-2 gap-y-2">
              <div className="text-muted-foreground text-sm">Date</div>
              <div className="font-semibold">{report.reportDate ? format(new Date(report.reportDate), 'MM/dd/yyyy') : '-'}</div>
              <div className="text-muted-foreground text-sm">Project</div>
              <div className="font-semibold">{report.projectName || '-'}</div>
              <div className="text-muted-foreground text-sm">Location</div>
              <div className="font-semibold">{report.workLocation || '-'}</div>
              <div className="text-muted-foreground text-sm">Hours</div>
              <div className="font-semibold">{report.startTime} - {report.stopTime}</div>
            </div>
          </div>
          
          <div>
            <h4 className="text-xs font-bold uppercase text-muted-foreground border-b border-border pb-1 mb-2">Safety</h4>
            <div className="flex items-center gap-2 mb-2">
              {report.safetyMeeting ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
              <span className="font-semibold">Safety Meeting: {report.safetyMeeting ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2">
              {report.injuries ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              <span className="font-semibold text-destructive">Injuries: {report.injuries ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase text-muted-foreground border-b border-border pb-1 mb-2">Work Performed</h4>
            <p className="text-sm font-medium whitespace-pre-wrap">{report.workPerformed || 'None provided'}</p>
          </div>
          
          <div>
            <h4 className="text-xs font-bold uppercase text-muted-foreground border-b border-border pb-1 mb-2">Hours Logged</h4>
            <div className="text-2xl font-black">{timeEntries.length} <span className="text-sm text-muted-foreground uppercase font-bold tracking-widest">Employees</span></div>
          </div>
        </div>
      </div>

      <PoleBillingReview reportId={report.id} />

      <div className="mt-8 pt-8 border-t border-border">
        <h4 className="text-sm font-bold uppercase tracking-wider mb-4">Foreman Signature</h4>
        <div 
          className="h-32 w-full max-w-md border-2 border-dashed border-muted-foreground/50 rounded-xl bg-secondary/30 flex items-center justify-center cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={() => setSignature(true)}
        >
          {signature ? (
            <div className="font-cursive text-3xl opacity-80 text-primary transform -rotate-6">
              {report.foremanName || "Signed digitally"}
            </div>
          ) : (
            <span className="text-muted-foreground font-semibold">Tap to sign digitally</span>
          )}
        </div>
      </div>
    </div>
  );
}
