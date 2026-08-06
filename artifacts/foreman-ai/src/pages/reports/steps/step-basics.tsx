import { useEffect, useRef, useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListProjects, useListCrews, useUpdateReport, getGetReportQueryKey, getListProjectsQueryKey, getListCrewsQueryKey, type DailyReportDetail } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface WorkPackage { id: number; name: string; code: string; description?: string | null; }

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
  const [workPackageId, setWorkPackageId] = useState<number | "">((report as any).workPackageId || "");

  const { data: projects } = useListProjects({ companyId: activeCompanyId! }, { 
    query: { enabled: !!activeCompanyId, queryKey: getListProjectsQueryKey({ companyId: activeCompanyId! }) } 
  });
  const { data: crews } = useListCrews({ companyId: activeCompanyId! }, { 
    query: { enabled: !!activeCompanyId, queryKey: getListCrewsQueryKey({ companyId: activeCompanyId! }) } 
  });

  const { data: workPackages = [] } = useQuery<WorkPackage[]>({
    queryKey: ["pkb-work-packages", activeCompanyId],
    queryFn: () =>
      fetch(`${BASE()}/api/pkb/work-packages?companyId=${activeCompanyId}`)
        .then(r => r.ok ? r.json() : []),
    enabled: !!activeCompanyId,
  });

  const lastSavedRef = useRef({
    reportDate, projectId, crewId, workLocation, generalForeman, startTime, stopTime, workPackageId
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = { reportDate, projectId, crewId, workLocation, generalForeman, startTime, stopTime, workPackageId };
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
            workPackageId: workPackageId === "" ? null : Number(workPackageId),
          } as any
        }, {
          onSuccess: (data) => {
            queryClient.setQueryData(getGetReportQueryKey(report.id), (old: any) => old ? { ...old, ...data } : old);
          }
        });
        lastSavedRef.current = current;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [reportDate, projectId, crewId, workLocation, generalForeman, startTime, stopTime, workPackageId, report.id, updateReport, queryClient]);

  const selectedWp = (workPackages as WorkPackage[]).find(wp => wp.id === Number(workPackageId));

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

      {/* Work Package selector */}
      <div className="border-t border-border pt-6 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <Label className="font-bold">Work Package</Label>
          <span className="text-xs text-muted-foreground">(sets required photos & billing codes)</span>
        </div>
        <select
          className="flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
          value={workPackageId}
          onChange={(e) => setWorkPackageId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">— No work package —</option>
          {(workPackages as WorkPackage[]).map(wp => (
            <option key={wp.id} value={wp.id}>{wp.name} ({wp.code})</option>
          ))}
        </select>
        {selectedWp?.description && (
          <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">{selectedWp.description}</p>
        )}
        {workPackageId && (
          <div className="flex items-center gap-2 text-xs text-primary font-bold">
            <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
              <Zap className="h-3 w-3 mr-1" /> Work Package Active
            </Badge>
            Required photos and billing codes will be enforced from this work package.
          </div>
        )}
      </div>
    </div>
  );
}
