import { useState } from "react";
import { type DailyReportDetail, useListReportEquipment, getListReportEquipmentQueryKey, useAddReportEquipment, useDeleteReportEquipment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function StepEquipment({ report }: { report: DailyReportDetail }) {
  const queryClient = useQueryClient();
  const { data: equipment = [], isLoading } = useListReportEquipment(report.id, {
    query: {
      enabled: !!report.id,
      queryKey: getListReportEquipmentQueryKey(report.id)
    }
  });

  const addEq = useAddReportEquipment();
  const deleteEq = useDeleteReportEquipment();

  const [newName, setNewName] = useState("");
  const [newUnitId, setNewUnitId] = useState("");
  const [newHours, setNewHours] = useState("8");

  const handleAdd = () => {
    if (!newName) return;
    addEq.mutate({
      reportId: report.id,
      data: {
        name: newName,
        unitId: newUnitId || undefined,
        hoursUsed: Number(newHours) || 8,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportEquipmentQueryKey(report.id) });
        setNewName("");
        setNewUnitId("");
        setNewHours("8");
      }
    });
  };

  const handleDelete = (equipmentId: number) => {
    deleteEq.mutate({
      reportId: report.id,
      equipmentId
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportEquipmentQueryKey(report.id) });
      }
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="bg-secondary/30 p-6 rounded-xl border border-border">
        <h3 className="font-bold uppercase tracking-wide mb-4">Add Equipment</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Type / Name</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Bucket Truck" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Unit ID</label>
            <Input value={newUnitId} onChange={e => setNewUnitId(e.target.value)} placeholder="e.g. BT-42" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Hours Used</label>
            <Input type="number" value={newHours} onChange={e => setNewHours(e.target.value)} />
          </div>
          <div>
            <Button onClick={handleAdd} disabled={!newName || addEq.isPending} className="w-full">
              <Plus className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Add</span>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-bold uppercase tracking-wide mb-4">Equipment Used</h3>
        <div className="border border-border rounded-xl overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase font-bold text-xs">
                <tr>
                  <th className="px-4 py-3">Equipment</th>
                  <th className="px-4 py-3">Unit ID</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {equipment.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground italic">
                      <Truck className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No equipment added.
                    </td>
                  </tr>
                ) : (
                  equipment.map(item => (
                    <tr key={item.id} className="border-t border-border hover:bg-muted/50">
                      <td className="px-4 py-3 font-semibold">{item.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unitId || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono">{item.hoursUsed}</td>
                      <td className="px-4 py-3 text-center">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(item.id)}
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
