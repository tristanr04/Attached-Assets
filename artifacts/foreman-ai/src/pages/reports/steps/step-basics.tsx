import { useEffect, useRef, useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListProjects, useListCrews, useUpdateReport, getGetReportQueryKey, getListProjectsQueryKey, getListCrewsQueryKey, type DailyReportDetail } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";

export default function StepBasics({ report }: { report: DailyReportDetail }) {
  const { activeCompanyId } = useCompanyStore();
  const updateReport = useUpdateReport();
  const queryClient = useQueryClient();
  
  const [reportDate, setReportDate] = useState(report.reportDate || "");
  const [projectId, setProjectId] = useState<number | "">(report.projectId || "");
  const [crewId, setCrewId] = useState<number | "">(report.crewId || "");
  const [workLocation, setWorkLocation] = useState(report.workLocation || "");
  const [generalForeman, setGeneralForeman] = useState(report.generalForeman || "");
  const [startTime, setStartTime] = useState(report.startTime || "");
  const [stopTime, setStopTime] = useState(report.stopTime || "");

  const { data: projects } = useListProjects({ companyId: activeCompanyId! }, { 
    query: { 
      enabled: !!activeCompanyId,
      queryKey: getListProjectsQueryKey({ companyId: activeCompanyId! })
    } 
  });
  
  const { data: crews } = useListCrews({ companyId: activeCompanyId! }, { 
    query: { 
      enabled: !!activeCompanyId,
      queryKey: getListCrewsQueryKey({ companyId: activeCompanyId! })
    } 
  });

  const lastSavedRef = useRef({
    reportDate, projectId, crewId, workLocation, generalForeman, startTime, stopTime
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = { reportDate, projectId, crewId, workLocation, generalForeman, startTime, stopTime };
      if (JSON.stringify(current) !== JSON.stringify(lastSavedRef.current)) {
        updateReport.mutate({
          reportId: report.id,
          data: {
            reportDate,
            projectId: projectId === "" ? null : Number(projectId),
            crewId: crewId === "" ? null : Number(crewId),
            workLocation,
            generalForeman,
            startTime,
            stopTime,
          }
        }, {
          onSuccess: (data) => {
            queryClient.setQueryData(getGetReportQueryKey(report.id), (old: any) => old ? { ...old, ...data } : old);
          }
        });
        lastSavedRef.current = current;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [reportDate, projectId, crewId, workLocation, generalForeman, startTime, stopTime, report.id, updateReport, queryClient]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Label>Report Date</Label>
          <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </div>
        <div className="space-y-3">
          <Label>Project</Label>
          <select 
            className="flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
            value={projectId} 
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select a Project...</option>
            {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-3">
          <Label>Crew</Label>
          <select 
            className="flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
            value={crewId} 
            onChange={(e) => setCrewId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select a Crew...</option>
            {crews?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-3">
          <Label>Work Location</Label>
          <Input placeholder="e.g. Substation 4, Pole 112" value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} />
        </div>
        <div className="space-y-3">
          <Label>General Foreman</Label>
          <Input placeholder="Name" value={generalForeman} onChange={(e) => setGeneralForeman(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label>Start Time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-3">
            <Label>Stop Time</Label>
            <Input type="time" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
