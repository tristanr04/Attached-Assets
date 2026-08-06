import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListReports, getListReportsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Loader2, Plus, HardHat, Search, Filter, Users } from "lucide-react";
import { format } from "date-fns";

export default function ReportsListPage() {
  const { activeCompanyId } = useCompanyStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: reports, isLoading } = useListReports(
    { 
      companyId: activeCompanyId!,
      status: statusFilter !== "all" ? (statusFilter as any) : undefined
    },
    {
      query: {
        enabled: !!activeCompanyId,
        queryKey: getListReportsQueryKey({ 
          companyId: activeCompanyId!,
          status: statusFilter !== "all" ? (statusFilter as any) : undefined
        })
      }
    }
  );

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight uppercase">Daily Reports</h1>
          <p className="text-muted-foreground font-medium text-lg mt-1">Manage and review site logs</p>
        </div>
        <Link href="/reports/new">
          <Button size="lg" className="h-12 px-6 font-bold uppercase tracking-wide gap-2">
            <Plus className="h-5 w-5" /> New Report
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <Tabs defaultValue="all" value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="bg-card border border-border h-12 p-1">
            <TabsTrigger value="all" className="h-10 px-6 font-bold uppercase tracking-wider text-xs">All Reports</TabsTrigger>
            <TabsTrigger value="draft" className="h-10 px-6 font-bold uppercase tracking-wider text-xs">Drafts</TabsTrigger>
            <TabsTrigger value="complete" className="h-10 px-6 font-bold uppercase tracking-wider text-xs">Completed</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-dashed bg-transparent mt-4">
            <CardContent className="flex flex-col items-center justify-center py-24 text-center">
              <div className="h-16 w-16 bg-card rounded-full flex items-center justify-center mb-4">
                <Filter className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mb-2">No reports found</p>
              <p className="text-muted-foreground">Try adjusting your filters or start a new report.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 mt-4">
            {reports.map((report) => (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <div className="group relative bg-card border border-border hover:border-primary/50 hover:shadow-md rounded-xl p-5 transition-all cursor-pointer overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold">{format(new Date(report.reportDate), 'EEEE, MMM do, yyyy')}</span>
                        <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-xs">
                          {report.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground font-medium">
                        <div className="flex items-center gap-1.5">
                          <HardHat className="h-4 w-4" />
                          {report.projectName || 'No Project'}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          {report.crewName || 'No Crew'}
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary">
                          {report.foremanName || 'Unknown Foreman'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
