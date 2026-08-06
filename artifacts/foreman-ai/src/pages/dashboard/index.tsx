import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetForemanDashboard, getGetForemanDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { FileText, Plus, Clock, Users, HardHat, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function DashboardPage() {
  const { activeCompanyId } = useCompanyStore();

  const { data: dashboard, isLoading } = useGetForemanDashboard(
    { companyId: activeCompanyId! },
    {
      query: {
        enabled: !!activeCompanyId,
        queryKey: getGetForemanDashboardQueryKey({ companyId: activeCompanyId! })
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight uppercase">Dashboard</h1>
          <p className="text-muted-foreground font-medium text-lg mt-1">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
        </div>
      </div>

      {/* Primary Action Area */}
      <div className="bg-card border border-border p-6 md:p-10 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <HardHat className="w-64 h-64 text-primary transform rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col items-start gap-6 max-w-2xl">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Today's Report</h2>
            <p className="text-muted-foreground text-lg">
              {dashboard.todayReportStatus === 'complete' 
                ? "Your report for today is complete and submitted."
                : dashboard.todayReportStatus === 'draft'
                  ? "You have a draft in progress for today."
                  : "No report started for today yet."}
            </p>
          </div>
          
          {dashboard.todayReportStatus === 'complete' ? (
            <Link href={`/reports/${dashboard.todayReportId}`}>
              <Button size="lg" variant="outline" className="h-16 px-8 text-lg bg-background">
                View Submitted Report
              </Button>
            </Link>
          ) : dashboard.todayReportStatus === 'draft' ? (
            <Link href={`/reports/${dashboard.todayReportId}`}>
              <Button size="lg" className="h-16 px-8 text-lg shadow-xl shadow-primary/20">
                Continue Draft Report
              </Button>
            </Link>
          ) : (
            <Link href="/reports/new">
              <Button size="lg" className="h-16 px-8 text-lg shadow-xl shadow-primary/20 gap-2">
                <Plus className="h-6 w-6" />
                Start Today's Report
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Drafts</CardTitle>
            <FileText className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.draftCount}</div>
            <p className="text-sm text-muted-foreground mt-1 font-medium">reports waiting for review</p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Current Crew</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{dashboard.currentCrew?.name || "No active crew"}</div>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              {dashboard.currentCrew ? `${dashboard.currentCrew.memberCount || 0} members assigned` : "Assign a crew in settings"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold uppercase tracking-tight">Recent Reports</h2>
          <Link href="/reports">
            <Button variant="ghost" className="font-bold text-primary">View All</Button>
          </Link>
        </div>
        
        {dashboard.recentReports.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {dashboard.recentReports.map(report => (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <div className="bg-card hover:bg-secondary/50 border border-border rounded-xl p-4 md:p-6 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm group">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 p-2 rounded-lg ${report.status === 'complete' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                      {report.status === 'complete' ? <CheckCircle2 className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                    </div>
                    <div>
                      <div className="font-bold text-lg">{format(new Date(report.reportDate), 'MMM d, yyyy')}</div>
                      <div className="text-muted-foreground font-medium flex items-center gap-2 mt-1">
                        <HardHat className="h-4 w-4" /> {report.projectName || 'Unassigned Project'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-sm px-3 py-1">
                      {report.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="bg-background border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-xl font-bold mb-2">No reports yet</p>
              <p className="text-muted-foreground mb-6">Your recent reports will appear here once you create them.</p>
              <Link href="/reports/new">
                <Button>Start First Report</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

import { CheckCircle2 } from "lucide-react";
