import { useParams } from "wouter";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetCrew, getGetCrewQueryKey, useListCrewMembers, getListCrewMembersQueryKey, useAddCrewMember, useRemoveCrewMember } from "@workspace/api-client-react";
import { Loader2, UserMinus, UserPlus, HardHat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function CrewDetailPage({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const { data: crew, isLoading: isCrewLoading } = useGetCrew(id, {
    query: {
      enabled: !!id,
      queryKey: getGetCrewQueryKey(id)
    }
  });

  const { data: members, isLoading: isMembersLoading } = useListCrewMembers(id, {
    query: {
      enabled: !!id,
      queryKey: getListCrewMembersQueryKey(id)
    }
  });

  const addMember = useAddCrewMember();
  const removeMember = useRemoveCrewMember();

  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("Lineman");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    
    addMember.mutate({
      crewId: id,
      data: {
        name: newName,
        trade: newTrade
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCrewMembersQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetCrewQueryKey(id) });
        setNewName("");
      }
    });
  };

  const handleRemove = (memberId: number) => {
    removeMember.mutate({
      crewId: id,
      memberId
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCrewMembersQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetCrewQueryKey(id) });
      }
    });
  };

  if (isCrewLoading || isMembersLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!crew) return <div>Crew not found</div>;

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight uppercase">{crew.name}</h1>
          <p className="text-muted-foreground font-medium text-lg mt-1">{crew.description || "Crew details and roster"}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="uppercase tracking-wide font-bold">Roster ({members?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {!members || members.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No members assigned to this crew.
                  </div>
                ) : (
                  members.map(member => (
                    <div key={member.id} className="py-4 flex justify-between items-center group">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center font-bold text-foreground">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold">{member.name}</div>
                          <div className="text-sm text-muted-foreground">{member.trade}</div>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemove(member.id)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-border shadow-md sticky top-6">
            <CardHeader>
              <CardTitle className="uppercase tracking-wide font-bold">Add Member</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full Name" />
                </div>
                <div className="space-y-2">
                  <Label>Trade / Role</Label>
                  <select 
                    className="flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
                    value={newTrade} 
                    onChange={e => setNewTrade(e.target.value)}
                  >
                    <option value="Lineman">Lineman</option>
                    <option value="Apprentice">Apprentice</option>
                    <option value="Operator">Operator</option>
                    <option value="Groundman">Groundman</option>
                    <option value="Foreman">Foreman</option>
                  </select>
                </div>
                <Button type="submit" className="w-full gap-2 font-bold mt-2" disabled={!newName || addMember.isPending}>
                  {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Add to Crew
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
