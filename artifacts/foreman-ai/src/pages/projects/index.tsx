import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListProjects, getListProjectsQueryKey, useCreateProject } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, HardHat } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ProjectsListPage() {
  const { activeCompanyId } = useCompanyStore();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const { data: projects, isLoading } = useListProjects(
    { companyId: activeCompanyId! },
    {
      query: {
        enabled: !!activeCompanyId,
        queryKey: getListProjectsQueryKey({ companyId: activeCompanyId! })
      }
    }
  );

  const createProject = useCreateProject();

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    createProject.mutate({
      data: {
        companyId: activeCompanyId!,
        name: newProjectName
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ companyId: activeCompanyId! }) });
        setIsCreating(false);
        setNewProjectName("");
      }
    });
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight uppercase">Projects</h1>
          <p className="text-muted-foreground font-medium text-lg mt-1">Active jobs and locations</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="font-bold uppercase tracking-wide gap-2">
          <Plus className="h-5 w-5" /> New Project
        </Button>
      </div>

      {isCreating && (
        <Card className="border-border shadow-md border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 items-center">
            <Input 
              value={newProjectName} 
              onChange={e => setNewProjectName(e.target.value)} 
              placeholder="Project Name" 
              className="max-w-md"
            />
            <Button onClick={handleCreate} disabled={!newProjectName || createProject.isPending}>
              {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <Card className="border-dashed bg-transparent mt-4">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 bg-card rounded-full flex items-center justify-center mb-4">
              <HardHat className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold mb-2">No projects found</p>
            <Button className="mt-4" onClick={() => setIsCreating(true)}>Create First Project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(project => (
            <Card key={project.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold">{project.name}</h3>
                  <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="uppercase">
                    {project.status}
                  </Badge>
                </div>
                {project.jobNumber && (
                  <div className="text-sm font-medium text-muted-foreground mb-4">
                    Job #: {project.jobNumber}
                  </div>
                )}
                <div className="space-y-2 text-sm mt-4 pt-4 border-t border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Location</span>
                    <span className="font-bold text-right">{project.workLocation || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Customer</span>
                    <span className="font-bold text-right">{project.customer || '-'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
