import { useState } from "react";
import { type DailyReportDetail, useListTimeEntries, getListTimeEntriesQueryKey, useCreateTimeEntry, useDeleteTimeEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Users, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useApiQuery } from "@/hooks/use-api";
import { useCompanyStore } from "@/hooks/use-company-store";

export default function StepHours({ report }: { report: DailyReportDetail }) {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useCompanyStore();
  
  const { data: timeEntries = [], isLoading } = useListTimeEntries(report.id, {
    query: {
      enabled: !!report.id,
      queryKey: getListTimeEntriesQueryKey(report.id)
    }
  });

  const { data: classifications = [] } = useApiQuery<any[]>(`/api/labor-classifications?companyId=${activeCompanyId}`, !!activeCompanyId);

  const createTimeEntry = useCreateTimeEntry();
  const deleteTimeEntry = useDeleteTimeEntry();

  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("Lineman");
  const [newReg, setNewReg] = useState("8");
  const [newOT, setNewOT] = useState("0");
  const [newDT, setNewDT] = useState("0");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (!newName) return;
    createTimeEntry.mutate({
      reportId: report.id,
      data: {
        employeeName: newName,
        trade: newTrade,
        regularHours: Number(newReg) || 0,
        overtimeHours: Number(newOT) || 0,
        doubleTimeHours: Number(newDT) || 0
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTimeEntriesQueryKey(report.id) });
        setNewName("");
        setNewReg("8");
        setNewOT("0");
        setNewDT("0");
        setIsAdding(false);
      }
    });
  };

  const handleDelete = (entryId: number) => {
    deleteTimeEntry.mutate({
      reportId: report.id,
      entryId
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTimeEntriesQueryKey(report.id) });
      }
    });
  };

  const totalCharge = timeEntries.reduce((sum, entry) => sum + ((entry.regularHours || 0) * 45), 0); // Mock charge

  return (
    <div className="pb-24 space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold uppercase tracking-wide">Labor Hours</h3>
        <Button onClick={() => setIsAdding(!isAdding)} variant="outline" className="font-bold h-12">
          {isAdding ? "Cancel" : <><UserPlus className="w-5 h-5 mr-2"/> Add Manual</>}
        </Button>
      </div>

      {isAdding && (
        <Card className="border-primary/50 bg-secondary/20 shadow-md">
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Employee Name</Label>
              <Input className="h-12 text-lg" value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Classification</Label>
              <Input className="h-12 text-lg" value={newTrade} onChange={e => setNewTrade(e.target.value)} placeholder="Lineman" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reg</Label>
                <Input className="h-12 text-lg text-center" type="number" step="0.5" value={newReg} onChange={e => setNewReg(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">OT</Label>
                <Input className="h-12 text-lg text-center" type="number" step="0.5" value={newOT} onChange={e => setNewOT(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">DT</Label>
                <Input className="h-12 text-lg text-center" type="number" step="0.5" value={newDT} onChange={e => setNewDT(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAdd} disabled={!newName || createTimeEntry.isPending} className="w-full h-14 text-lg font-bold uppercase mt-4">
              <Plus className="h-5 w-5 mr-2" /> Add to Report
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {timeEntries.length === 0 ? (
          <Card className="border-dashed bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-bold text-lg">No hours logged yet</p>
              <p className="text-muted-foreground">Tap "Add Manual" or import from crew.</p>
            </CardContent>
          </Card>
        ) : (
          timeEntries.map(entry => (
            <Card key={entry.id} className="shadow-sm border-border relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
              <CardContent className="p-4 pl-6">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-lg">{entry.employeeName}</h4>
                    <p className="text-sm font-medium text-muted-foreground">{entry.trade}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-12 w-12 text-destructive hover:bg-destructive/10 -mr-2"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-3">
                  <div className="bg-secondary/30 rounded py-2">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Reg</div>
                    <div className="font-mono text-xl font-bold">{entry.regularHours}</div>
                  </div>
                  <div className="bg-secondary/30 rounded py-2">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">OT</div>
                    <div className="font-mono text-xl font-bold">{entry.overtimeHours || 0}</div>
                  </div>
                  <div className="bg-secondary/30 rounded py-2">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">DT</div>
                    <div className="font-mono text-xl font-bold">{entry.doubleTimeHours || 0}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="fixed bottom-[80px] md:bottom-0 left-0 right-0 p-4 bg-card/80 backdrop-blur-md border-t border-border z-10 md:static md:bg-transparent md:border-t-0 md:p-0">
        <div className="max-w-6xl mx-auto">
          <Card className="bg-primary text-primary-foreground border-none shadow-lg">
            <CardContent className="p-4 flex justify-between items-center">
              <div className="font-bold uppercase tracking-widest text-sm">Total Labor</div>
              <div className="text-2xl font-mono font-bold">${totalCharge.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}