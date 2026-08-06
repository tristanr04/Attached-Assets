import { useState } from "react";
import { type DailyReportDetail, useListReportMaterials, getListReportMaterialsQueryKey, useAddReportMaterial, useDeleteReportMaterial } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function StepMaterials({ report }: { report: DailyReportDetail }) {
  const queryClient = useQueryClient();
  const { data: materials = [], isLoading } = useListReportMaterials(report.id, {
    query: {
      enabled: !!report.id,
      queryKey: getListReportMaterialsQueryKey(report.id)
    }
  });

  const addMaterial = useAddReportMaterial();
  const deleteMaterial = useDeleteReportMaterial();

  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("ea");

  const handleAdd = () => {
    if (!newName) return;
    addMaterial.mutate({
      reportId: report.id,
      data: {
        name: newName,
        quantity: Number(newQty) || 1,
        unit: newUnit,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportMaterialsQueryKey(report.id) });
        setNewName("");
        setNewQty("1");
        setNewUnit("ea");
      }
    });
  };

  const handleDelete = (materialId: number) => {
    deleteMaterial.mutate({
      reportId: report.id,
      materialId
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportMaterialsQueryKey(report.id) });
      }
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="bg-secondary/30 p-6 rounded-xl border border-border">
        <h3 className="font-bold uppercase tracking-wide mb-4">Add Material</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Item Name</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. 40ft Class 3 Pole" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Quantity</label>
            <Input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Unit</label>
            <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="ea, ft, lbs" />
          </div>
          <div>
            <Button onClick={handleAdd} disabled={!newName || addMaterial.isPending} className="w-full">
              <Plus className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Add</span>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-bold uppercase tracking-wide mb-4">Materials Used</h3>
        <div className="border border-border rounded-xl overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase font-bold text-xs">
                <tr>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground italic">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No materials added.
                    </td>
                  </tr>
                ) : (
                  materials.map(item => (
                    <tr key={item.id} className="border-t border-border hover:bg-muted/50">
                      <td className="px-4 py-3 font-semibold">{item.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{item.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
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
