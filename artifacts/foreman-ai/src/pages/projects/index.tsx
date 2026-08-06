import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListProjects, getListProjectsQueryKey, useCreateProject } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, HardHat, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";

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
      data: { companyId: activeCompanyId!, name: newProjectName }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ companyId: activeCompanyId! }) });
        setIsCreating(false);
        setNewProjectName("");
      }
    });
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">Projects</h1>
        </div>
        
        <Sheet open={isCreating} onOpenChange={setIsCreating}>
          <SheetTrigger asChild>
            <Button size="lg" className="w-full md:w-auto h-14 md:h-12 px-6 font-bold uppercase tracking-wide gap-2">
              <Plus className="h-5 w-5" /> New Project
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[auto] max-h-[90dvh] rounded-t-2xl px-4 md:px-6 md:w-[400px] md:side-right md:h-full md:rounded-none pb-safe">
            <SheetHeader className="mb-6">
              <SheetTitle className="uppercase tracking-wide font-extrabold text-left">Create New Project</SheetTitle>
            </SheetHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Project Name</Label>
                <Input 
                  value={newProjectName} 
                  onChange={e => setNewProjectName(e.target.value)} 
                  placeholder="e.g. Substation Upgrade 42" 
                  className="h-14 text-lg"
                />
              </div>
              <Button 
                onClick={handleCreate} 
                disabled={!newProjectName || createProject.isPending}
                className="w-full h-14 text-lg uppercase font-bold"
              >
                {createProject.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <Card className="border-dashed bg-transparent mt-4">
          <CardContent className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="h-16 w-16 bg-card rounded-full flex items-center justify-center mb-4">
              <HardHat className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold mb-2">No projects found</p>
            <Button className="mt-4 h-12 px-6" onClick={() => setIsCreating(true)}>Create First Project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projects.map(project => (
            <Card key={project.id} className="hover:border-primary/50 transition-colors active:scale-[0.98]">
              <CardContent className="p-5 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold pr-4 leading-tight">{project.name}</h3>
                  <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-widest px-2 py-1">
                    {project.status}
                  </Badge>
                </div>
                {project.jobNumber && (
                  <div className="text-xs font-mono text-muted-foreground mb-4">
                    Job #: {project.jobNumber}
                  </div>
                )}
                <div className="space-y-3 mt-2 bg-secondary/20 p-3 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-bold text-[10px] uppercase tracking-widest">Location</span>
                    <span className="font-bold text-right truncate max-w-[60%]">{project.workLocation || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-bold text-[10px] uppercase tracking-widest">Customer</span>
                    <span className="font-bold text-right truncate max-w-[60%]">{project.customer || '-'}</span>
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