import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useListCrews, getListCrewsQueryKey, useCreateCrew } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Loader2, Plus, Users, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";

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
      data: { companyId: activeCompanyId!, name: newCrewName }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCrewsQueryKey({ companyId: activeCompanyId! }) });
        setIsCreating(false);
        setNewCrewName("");
      }
    });
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">Crews</h1>
        </div>
        
        <Sheet open={isCreating} onOpenChange={setIsCreating}>
          <SheetTrigger asChild>
            <Button size="lg" className="w-full md:w-auto h-14 md:h-12 px-6 font-bold uppercase tracking-wide gap-2">
              <Plus className="h-5 w-5" /> New Crew
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[auto] max-h-[90dvh] rounded-t-2xl px-4 md:px-6 md:w-[400px] md:side-right md:h-full md:rounded-none pb-safe">
            <SheetHeader className="mb-6">
              <SheetTitle className="uppercase tracking-wide font-extrabold text-left">Create New Crew</SheetTitle>
            </SheetHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Crew Name</Label>
                <Input 
                  value={newCrewName} 
                  onChange={e => setNewCrewName(e.target.value)} 
                  placeholder="e.g. Overhead Crew A" 
                  className="h-14 text-lg"
                />
              </div>
              <Button 
                onClick={handleCreate} 
                disabled={!newCrewName || createCrew.isPending}
                className="w-full h-14 text-lg uppercase font-bold"
              >
                {createCrew.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !crews || crews.length === 0 ? (
        <Card className="border-dashed bg-transparent mt-4">
          <CardContent className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="h-16 w-16 bg-card rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold mb-2">No crews configured</p>
            <Button className="mt-4 h-12 px-6" onClick={() => setIsCreating(true)}>Create First Crew</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {crews.map(crew => (
            <Link key={crew.id} href={`/crews/${crew.id}`}>
              <Card className="hover:border-primary/50 cursor-pointer transition-all active:scale-[0.98]">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold">{crew.name}</h3>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-3 mt-2">
                    <div className="flex justify-between items-center text-sm font-medium bg-secondary/30 p-2 rounded">
                      <span className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold">Foreman</span>
                      <span className="font-bold">{crew.foremanName || 'Unassigned'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-medium p-2">
                      <span className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold">Members</span>
                      <span className="bg-primary/20 text-primary px-3 py-1 rounded-full font-bold text-xs">{crew.memberCount || 0}</span>
                    </div>
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