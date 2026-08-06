import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetForemanDashboard, getGetForemanDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { FileText, Plus, Clock, Users, HardHat, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
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
    <div className="space-y-6 md:space-y-8 pb-8">
      <div className="flex flex-col justify-start">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">Dashboard</h1>
        <p className="text-muted-foreground font-medium text-base md:text-lg mt-1">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
      </div>

      {/* Primary Action Area */}
      <div className="bg-card border border-border p-5 md:p-10 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <HardHat className="w-64 h-64 text-primary transform rotate-12 translate-x-12 -translate-y-12" />
        </div>
        <div className="relative z-10 flex flex-col items-start gap-5 md:gap-6 max-w-2xl">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Today's Report</h2>
            <p className="text-muted-foreground text-base md:text-lg">
              {dashboard.todayReportStatus === 'complete' 
                ? "Your report for today is complete and submitted."
                : dashboard.todayReportStatus === 'draft'
                  ? "You have a draft in progress for today."
                  : "No report started for today yet."}
            </p>
          </div>
          
          {dashboard.todayReportStatus === 'complete' ? (
            <Link href={`/reports/${dashboard.todayReportId}`} className="w-full md:w-auto">
              <Button size="lg" variant="outline" className="w-full h-16 px-8 text-lg bg-background">
                View Submitted Report
              </Button>
            </Link>
          ) : dashboard.todayReportStatus === 'draft' ? (
            <Link href={`/reports/${dashboard.todayReportId}`} className="w-full md:w-auto">
              <Button size="lg" className="w-full h-16 px-8 text-lg shadow-xl shadow-primary/20">
                Continue Draft Report
              </Button>
            </Link>
          ) : (
            <Link href="/reports/new" className="w-full md:w-auto">
              <Button size="lg" className="w-full h-16 px-8 text-lg shadow-xl shadow-primary/20 gap-2">
                <Plus className="h-6 w-6" />
                Start Today's Report
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 md:p-6">
            <CardTitle className="text-[10px] md:text-sm font-bold uppercase tracking-wider text-muted-foreground">Drafts</CardTitle>
            <FileText className="h-4 w-4 md:h-5 md:w-5 text-yellow-500" />
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            <div className="text-2xl md:text-4xl font-black">{dashboard.draftCount}</div>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 md:p-6">
            <CardTitle className="text-[10px] md:text-sm font-bold uppercase tracking-wider text-muted-foreground">Current Crew</CardTitle>
            <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            <div className="text-lg md:text-2xl font-bold truncate">{dashboard.currentCrew?.name || "No crew"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight">Recent Reports</h2>
          <Link href="/reports">
            <Button variant="ghost" className="font-bold text-primary px-2">View All</Button>
          </Link>
        </div>
        
        {dashboard.recentReports.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {dashboard.recentReports.map(report => (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <Card className="hover:border-primary/50 cursor-pointer transition-all active:scale-[0.98]">
                  <CardContent className="p-4 md:p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl flex-shrink-0 ${report.status === 'complete' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                        {report.status === 'complete' ? <CheckCircle2 className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-lg truncate">{format(new Date(report.reportDate), 'MMM d, yyyy')}</div>
                        <div className="text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5 text-sm truncate">
                          <HardHat className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{report.projectName || 'Unassigned'}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-xs px-2.5 py-1 whitespace-nowrap">
                      {report.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="bg-background border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
              <p className="text-lg font-bold mb-1">No reports yet</p>
              <p className="text-sm text-muted-foreground mb-6">Recent reports will appear here.</p>
              <Link href="/reports/new" className="w-full md:w-auto">
                <Button className="w-full">Start First Report</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}