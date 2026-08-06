import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetAdminDashboard, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, HardHat, FileText, CheckCircle2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";

export default function AdminDashboardPage() {
  const { activeCompanyId } = useCompanyStore();

  const { data: dashboard, isLoading } = useGetAdminDashboard(
    { companyId: activeCompanyId! },
    {
      query: {
        enabled: !!activeCompanyId,
        queryKey: getGetAdminDashboardQueryKey({ companyId: activeCompanyId! })
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
        <h1 className="text-4xl font-extrabold tracking-tight uppercase">Admin Dashboard</h1>
        <p className="text-muted-foreground font-medium text-lg mt-1">System usage and analytics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Total Users</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.totalUsers}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Total Reports</CardTitle>
            <FileText className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.totalReports}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-green-500">{dashboard.completedReports}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Active Projects</CardTitle>
            <HardHat className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{dashboard.totalProjects}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-md">
        <CardHeader>
          <CardTitle className="uppercase tracking-wide font-bold">Reports by Project</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full mt-4">
            {dashboard.reportsByProject && dashboard.reportsByProject.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.reportsByProject}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="projectName" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 'bold' }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 'bold' }} 
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="reportCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No project data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
