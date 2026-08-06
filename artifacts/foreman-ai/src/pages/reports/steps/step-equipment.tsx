import { useState } from "react";
import { type DailyReportDetail, useListReportEquipment, getListReportEquipmentQueryKey, useAddReportEquipment, useDeleteReportEquipment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Truck, Search, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

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

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newHours, setNewHours] = useState<Record<string, string>>({});
  
  // Mock catalog
  const catalog = [
    { id: 1, name: "Bucket Truck 45'", unitId: "BT-101", type: "Utility Trucks", rate: 85 },
    { id: 2, name: "Digger Derrick", unitId: "DD-204", type: "Heavy Equipment", rate: 120 },
    { id: 3, name: "Wire Trailer", unitId: "TR-05", type: "Trailers", rate: 25 },
    { id: 4, name: "Skid Steer", unitId: "SS-12", type: "Heavy Equipment", rate: 95 },
  ];

  const handleAdd = (item: any) => {
    const hours = Number(newHours[item.id]) || 8;
    addEq.mutate({
      reportId: report.id,
      data: {
        name: item.name,
        unitId: item.unitId,
        hoursUsed: hours,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportEquipmentQueryKey(report.id) });
        setIsPickerOpen(false);
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
    <div className="pb-24 space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold uppercase tracking-wide">Equipment</h3>
        <Sheet open={isPickerOpen} onOpenChange={setIsPickerOpen}>
          <SheetTrigger asChild>
            <Button className="font-bold h-12 gap-2">
              <Plus className="w-5 h-5"/> Add Equip
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto px-4 rounded-t-2xl md:w-[600px] md:side-right md:h-full md:rounded-none">
            <SheetHeader className="mb-6 sticky top-0 bg-background z-10 py-4 border-b border-border">
              <SheetTitle className="uppercase tracking-wide font-extrabold text-left">Equipment Picker</SheetTitle>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <Input 
                  placeholder="Search catalog..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-14 text-lg bg-secondary/50 border-transparent focus-visible:ring-primary"
                />
              </div>
            </SheetHeader>
            <div className="space-y-4 pb-20">
              {catalog.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.unitId.toLowerCase().includes(search.toLowerCase())).map(item => (
                <Card key={item.id} className="border-border shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-bold text-lg">{item.name}</h4>
                        <Badge variant="outline" className="font-mono">{item.unitId}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-medium mt-1">{item.type} • ${item.rate}/hr</p>
                      
                      <div className="flex items-center gap-4 mt-4">
                        <div className="flex-1">
                          <Label className="text-xs uppercase text-muted-foreground font-bold mb-1 block">Hours</Label>
                          <Input 
                            type="number" 
                            className="h-12 font-mono text-lg text-center" 
                            value={newHours[item.id] || "8"}
                            onChange={e => setNewHours({...newHours, [item.id]: e.target.value})}
                          />
                        </div>
                        <Button 
                          onClick={() => handleAdd(item)}
                          disabled={addEq.isPending}
                          className="flex-1 h-12 uppercase font-bold mt-5"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-4">
        {equipment.length === 0 ? (
          <Card className="border-dashed bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-bold text-lg">No equipment added</p>
              <p className="text-muted-foreground">Tap "Add Equip" to pick from catalog.</p>
            </CardContent>
          </Card>
        ) : (
          equipment.map(item => (
            <Card key={item.id} className="shadow-sm border-border overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4 md:p-6 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-lg">{item.name}</h4>
                        {item.unitId && <p className="text-sm font-medium text-muted-foreground font-mono mt-1">Unit: {item.unitId}</p>}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-12 w-12 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 bg-secondary/30 p-3 rounded-lg md:bg-transparent md:p-0">
                    <div>
                      <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Hours Used</Label>
                      <div className="font-mono text-2xl font-bold">{item.hoursUsed}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}