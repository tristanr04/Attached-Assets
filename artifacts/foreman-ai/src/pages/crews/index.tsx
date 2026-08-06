import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListCrews, getListCrewsQueryKey, useCreateCrew } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Loader2, Plus, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function CrewsListPage() {
  const { activeCompanyId } = useCompanyStore();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newCrewName, setNewCrewName] = useState("");

  const { data: crews, isLoading } = useListCrews(
    { companyId: activeCompanyId! },
    {
      query: {
        enabled: !!activeCompanyId,
        queryKey: getListCrewsQueryKey({ companyId: activeCompanyId! })
      }
    }
  );

  const createCrew = useCreateCrew();

  const handleCreate = () => {
    if (!newCrewName.trim()) return;
    createCrew.mutate({
      data: {
        companyId: activeCompanyId!,
        name: newCrewName
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCrewsQueryKey({ companyId: activeCompanyId! }) });
        setIsCreating(false);
        setNewCrewName("");
      }
    });
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight uppercase">Crews</h1>
          <p className="text-muted-foreground font-medium text-lg mt-1">Manage field teams</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="font-bold uppercase tracking-wide gap-2">
          <Plus className="h-5 w-5" /> New Crew
        </Button>
      </div>

      {isCreating && (
        <Card className="border-border shadow-md border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle>Create New Crew</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 items-center">
            <Input 
              value={newCrewName} 
              onChange={e => setNewCrewName(e.target.value)} 
              placeholder="Crew Name (e.g. Overhead Crew A)" 
              className="max-w-md"
            />
            <Button onClick={handleCreate} disabled={!newCrewName || createCrew.isPending}>
              {createCrew.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !crews || crews.length === 0 ? (
        <Card className="border-dashed bg-transparent mt-4">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 bg-card rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold mb-2">No crews configured</p>
            <Button className="mt-4" onClick={() => setIsCreating(true)}>Create First Crew</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crews.map(crew => (
            <Link key={crew.id} href={`/crews/${crew.id}`}>
              <Card className="hover:border-primary/50 cursor-pointer transition-colors h-full flex flex-col group">
                <CardContent className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-2xl font-bold group-hover:text-primary transition-colors">{crew.name}</h3>
                    {crew.description && <p className="text-muted-foreground mt-2 line-clamp-2">{crew.description}</p>}
                  </div>
                  <div className="mt-6 pt-4 border-t border-border flex justify-between items-center text-sm font-medium">
                    <span className="text-muted-foreground uppercase tracking-widest text-xs">Foreman</span>
                    <span className="font-bold">{crew.foremanName || 'Unassigned'}</span>
                  </div>
                  <div className="mt-2 flex justify-between items-center text-sm font-medium">
                    <span className="text-muted-foreground uppercase tracking-widest text-xs">Members</span>
                    <span className="bg-secondary px-2 py-0.5 rounded-full font-bold">{crew.memberCount || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
