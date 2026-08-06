import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListReports, getListReportsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Loader2, Plus, HardHat, Filter, Users, ChevronRight } from "lucide-react";
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
    <div className="space-y-6 md:space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">Daily Reports</h1>
        </div>
        <Link href="/reports/new" className="w-full md:w-auto">
          <Button size="lg" className="w-full h-14 md:h-12 px-6 font-bold uppercase tracking-wide gap-2">
            <Plus className="h-5 w-5" /> New Report
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar gap-2">
          {["all", "draft", "complete"].map(f => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              className="rounded-full px-6 h-10 font-bold uppercase tracking-widest text-xs whitespace-nowrap flex-shrink-0"
              onClick={() => setStatusFilter(f)}
            >
              {f === "all" ? "All Reports" : f}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-dashed bg-transparent mt-2">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="h-16 w-16 bg-card rounded-full flex items-center justify-center mb-4">
                <Filter className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mb-2">No reports found</p>
              <p className="text-muted-foreground">Adjust filters or start a new report.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
            {reports.map((report) => (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <Card className="hover:border-primary/50 cursor-pointer transition-all active:scale-[0.98]">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-lg font-bold">{format(new Date(report.reportDate), 'MMM do, yyyy')}</span>
                      <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-xs uppercase tracking-wider">
                        {report.status}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground font-medium">
                      <div className="flex items-center gap-2">
                        <HardHat className="h-4 w-4 text-primary" />
                        <span className="truncate">{report.projectName || 'No Project'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="truncate">{report.crewName || 'No Crew'}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border flex justify-between items-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <span>{report.foremanName || 'Unknown'}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}