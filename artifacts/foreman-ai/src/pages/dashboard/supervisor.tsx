import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetSupervisorDashboard, getGetSupervisorDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, Users } from "lucide-react";
import { format } from "date-fns";

export default function SupervisorDashboardPage() {
  const { activeCompanyId } = useCompanyStore();

  const { data: dashboard, isLoading } = useGetSupervisorDashboard(
    { companyId: activeCompanyId! },
    {
      query: {
        enabled: !!activeCompanyId,
        queryKey: getGetSupervisorDashboardQueryKey({ companyId: activeCompanyId! })
      }
    }
  );

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight uppercase">Supervisor Overview</h1>
        <p className="text-muted-foreground font-medium text-lg mt-1">Field operations summary</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pending Review</CardTitle>
            <Clock className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.pendingReviewCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-md border-l-4 border-l-destructive">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Missing Reports</CardTitle>
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-destructive">{dashboard.missingReportsCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Incidents</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.recentIncidents?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Active Crews</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.reportsByCrewCount?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {dashboard.recentIncidents && dashboard.recentIncidents.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold uppercase tracking-tight text-destructive flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" /> Recent Incidents / Safety Reports
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {dashboard.recentIncidents.map(report => (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 transition-all hover:bg-destructive/20 cursor-pointer flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <div className="font-bold text-lg flex items-center gap-2 text-destructive">
                      {format(new Date(report.reportDate), 'MMM d, yyyy')} - {report.foremanName || 'Unknown Foreman'}
                    </div>
                    <div className="text-foreground mt-2 font-medium">
                      {report.injuryDetails || report.safetyNotes || "Safety issue reported"}
                    </div>
                  </div>
                  <Badge variant="destructive" className="self-start">Requires Attention</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-2xl font-bold uppercase tracking-tight">Recent Reports</h2>
        <div className="grid grid-cols-1 gap-4">
          {dashboard.recentReports.slice(0, 5).map(report => (
            <Link key={report.id} href={`/reports/${report.id}`}>
              <div className="bg-card hover:bg-secondary/50 border border-border rounded-xl p-4 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="font-bold text-lg">{format(new Date(report.reportDate), 'MMM d, yyyy')}</div>
                  <div className="text-muted-foreground font-medium mt-1">
                    {report.crewName || 'Unassigned Crew'} • {report.projectName || 'Unassigned Project'}
                  </div>
                </div>
                <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-sm px-3 py-1">
                  {report.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
