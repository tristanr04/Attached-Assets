import { useState } from "react";
import { type DailyReportDetail, useListTimeEntries, getListTimeEntriesQueryKey, useCreateTimeEntry, useDeleteTimeEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function StepHours({ report }: { report: DailyReportDetail }) {
  const queryClient = useQueryClient();
  const { data: timeEntries = [], isLoading } = useListTimeEntries(report.id, {
    query: {
      enabled: !!report.id,
      queryKey: getListTimeEntriesQueryKey(report.id)
    }
  });

  const createTimeEntry = useCreateTimeEntry();
  const deleteTimeEntry = useDeleteTimeEntry();

  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("Lineman");
  const [newReg, setNewReg] = useState("8");
  const [newOT, setNewOT] = useState("0");
  const [newDT, setNewDT] = useState("0");

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
        setNewTrade("Lineman");
        setNewReg("8");
        setNewOT("0");
        setNewDT("0");
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

  // Option to auto-populate from crew if crewId exists and no time entries exist
  // We'll skip complex auto-populate for this mockup, just show manual add

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="bg-secondary/30 p-6 rounded-xl border border-border">
        <h3 className="font-bold uppercase tracking-wide mb-4">Add Employee</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Name</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Trade</label>
            <Input value={newTrade} onChange={e => setNewTrade(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Reg (hrs)</label>
            <Input type="number" value={newReg} onChange={e => setNewReg(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">OT (hrs)</label>
            <Input type="number" value={newOT} onChange={e => setNewOT(e.target.value)} />
          </div>
          <div>
            <Button onClick={handleAdd} disabled={!newName || createTimeEntry.isPending} className="w-full">
              <Plus className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Add</span>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-bold uppercase tracking-wide mb-4">Time Entries</h3>
        <div className="border border-border rounded-xl overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase font-bold text-xs">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Trade</th>
                  <th className="px-4 py-3 text-right">Reg</th>
                  <th className="px-4 py-3 text-right">OT</th>
                  <th className="px-4 py-3 text-right">DT</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No hours logged yet. Add employees above.
                    </td>
                  </tr>
                ) : (
                  timeEntries.map(entry => (
                    <tr key={entry.id} className="border-t border-border hover:bg-muted/50">
                      <td className="px-4 py-3 font-semibold">{entry.employeeName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.trade}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.regularHours}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.overtimeHours || 0}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.doubleTimeHours || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
