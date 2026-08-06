import { useParams, Link } from "wouter";
import { useCompanyStore } from "@/hooks/use-company-store";
import { 
  useGetReport, getGetReportQueryKey, 
  useListTimeEntries, getListTimeEntriesQueryKey,
  useListReportMaterials, getListReportMaterialsQueryKey,
  useListReportEquipment, getListReportEquipmentQueryKey
} from "@workspace/api-client-react";
import { Loader2, Printer, Edit2, CheckCircle2, AlertTriangle, Users, Package, Truck, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

export default function ReportDetailPage({ id }: { id: number }) {
  const { data: report, isLoading: isReportLoading } = useGetReport(id, {
    query: { enabled: !!id, queryKey: getGetReportQueryKey(id) }
  });

  const { data: timeEntries = [], isLoading: isTimeLoading } = useListTimeEntries(id, {
    query: { enabled: !!id, queryKey: getListTimeEntriesQueryKey(id) }
  });

  const { data: materials = [], isLoading: isMatLoading } = useListReportMaterials(id, {
    query: { enabled: !!id, queryKey: getListReportMaterialsQueryKey(id) }
  });

  const { data: equipment = [], isLoading: isEqLoading } = useListReportEquipment(id, {
    query: { enabled: !!id, queryKey: getListReportEquipmentQueryKey(id) }
  });

  const isLoading = isReportLoading || isTimeLoading || isMatLoading || isEqLoading;

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) return <div>Report not found</div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-extrabold tracking-tight uppercase">Daily Report</h1>
            <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-sm">
              {report.status}
            </Badge>
          </div>
          <p className="text-muted-foreground font-medium text-lg">
            {format(new Date(report.reportDate), 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/reports/${id}/print`}>
            <Button variant="outline" className="font-bold gap-2">
              <Printer className="h-4 w-4" /> Print PDF
            </Button>
          </Link>
          {report.status === 'draft' && (
            <Link href={`/reports/${id}/edit`}>
              <Button className="font-bold gap-2">
                <Edit2 className="h-4 w-4" /> Edit Draft
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide font-bold">General Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Project</dt>
                <dd className="font-semibold text-lg flex items-center gap-2 mt-1">
                  <HardHat className="h-4 w-4 text-primary" />
                  {report.projectName || 'Not specified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Crew</dt>
                <dd className="font-semibold text-lg flex items-center gap-2 mt-1">
                  <Users className="h-4 w-4 text-primary" />
                  {report.crewName || 'Not specified'}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Foreman</dt>
                  <dd className="font-semibold">{report.foremanName || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Location</dt>
                  <dd className="font-semibold">{report.workLocation || '-'}</dd>
                </div>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border shadow-md">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide font-bold">Work Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Description</h4>
                <p className="text-base font-medium whitespace-pre-wrap">{report.workPerformed || 'No work description provided.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  {report.safetyMeeting ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                  )}
                  <span className="font-bold">Safety Meeting {report.safetyMeeting ? 'Held' : 'Not Held'}</span>
                </div>
                <div className="flex items-center gap-3">
                  {report.injuries ? (
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  )}
                  <span className={`font-bold ${report.injuries ? 'text-destructive' : ''}`}>
                    {report.injuries ? 'Injuries Occurred' : 'No Injuries'}
                  </span>
                </div>
              </div>
              {(report.delays || report.safetyNotes || report.injuryDetails) && (
                <div className="bg-secondary/30 p-4 rounded-xl space-y-4">
                  {report.delays && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Delays</h4>
                      <p className="font-medium text-sm mt-1">{report.delays}</p>
                    </div>
                  )}
                  {report.injuryDetails && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-destructive">Injury Details</h4>
                      <p className="font-medium text-sm mt-1 text-destructive">{report.injuryDetails}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold uppercase tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6" /> Labor Hours
        </h2>
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase font-bold text-xs">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Trade</th>
                  <th className="px-4 py-3 text-right">Reg</th>
                  <th className="px-4 py-3 text-right">OT</th>
                  <th className="px-4 py-3 text-right">DT</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">No hours logged.</td>
                  </tr>
                ) : (
                  timeEntries.map(entry => (
                    <tr key={entry.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{entry.employeeName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.trade}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.regularHours}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.overtimeHours || 0}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.doubleTimeHours || 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5" /> Materials
          </h2>
          <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase font-bold text-xs">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3">Unit</th>
                </tr>
              </thead>
              <tbody>
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground italic">No materials.</td>
                  </tr>
                ) : (
                  materials.map(item => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{item.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{item.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
            <Truck className="h-5 w-5" /> Equipment
          </h2>
          <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase font-bold text-xs">
                <tr>
                  <th className="px-4 py-3">Equipment</th>
                  <th className="px-4 py-3">Unit ID</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {equipment.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground italic">No equipment.</td>
                  </tr>
                ) : (
                  equipment.map(item => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{item.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unitId || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono">{item.hoursUsed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
