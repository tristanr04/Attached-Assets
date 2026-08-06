import { useState, useMemo } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useApiQuery, useApiMutation } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit2, Trash2, Loader2, Users, HardHat, FileText, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface LaborClassification {
  id: number;
  name: string;
  billingCode?: string;
  baseRate: number;
  overtimeRate?: number;
  doubleTimeRate?: number;
  stormRate?: number;
  emergencyRate?: number;
  perDiemRate?: number;
  travelRate?: number;
  minimumBillableHours?: number;
  notes?: string;
  active: boolean;
}

export default function RatesSettingsPage() {
  const { activeCompanyId } = useCompanyStore();
  
  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      <div className="flex flex-col justify-start">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase">Rates & Billing</h1>
        <p className="text-muted-foreground font-medium text-base md:text-lg mt-1">Manage billing rules, labor classes, and equipment rates</p>
      </div>

      <Tabs defaultValue="labor" className="w-full">
        <TabsList className="bg-card border border-border h-auto p-1 flex flex-wrap w-full">
          <TabsTrigger value="labor" className="flex-1 py-3 font-bold uppercase tracking-wider text-xs whitespace-normal h-auto min-h-12"><Users className="w-4 h-4 mr-2 hidden md:inline"/>Labor</TabsTrigger>
          <TabsTrigger value="equipment" className="flex-1 py-3 font-bold uppercase tracking-wider text-xs whitespace-normal h-auto min-h-12"><HardHat className="w-4 h-4 mr-2 hidden md:inline"/>Equipment</TabsTrigger>
          <TabsTrigger value="items" className="flex-1 py-3 font-bold uppercase tracking-wider text-xs whitespace-normal h-auto min-h-12"><Package className="w-4 h-4 mr-2 hidden md:inline"/>Items</TabsTrigger>
          <TabsTrigger value="templates" className="flex-1 py-3 font-bold uppercase tracking-wider text-xs whitespace-normal h-auto min-h-12"><FileText className="w-4 h-4 mr-2 hidden md:inline"/>Templates</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="labor"><LaborTab companyId={activeCompanyId!} /></TabsContent>
          <TabsContent value="equipment"><EquipmentTab companyId={activeCompanyId!} /></TabsContent>
          <TabsContent value="items"><BillableItemsTab companyId={activeCompanyId!} /></TabsContent>
          <TabsContent value="templates"><TemplatesTab companyId={activeCompanyId!} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function LaborTab({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const { data: classes, isLoading } = useApiQuery<LaborClassification[]>(`/api/labor-classifications?companyId=${companyId}`, !!companyId);
  const saveMutation = useApiMutation<any, any>('POST', `/api/labor-classifications`);
  const updateMutation = useApiMutation<any, any>('PATCH', `/api/labor-classifications`);
  const deleteMutation = useApiMutation<any, any>('DELETE', `/api/labor-classifications`);
  
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LaborClassification | null>(null);

  const [formData, setFormData] = useState({
    name: '', billingCode: '', baseRate: '', overtimeRate: '', doubleTimeRate: '', 
    stormRate: '', emergencyRate: '', perDiemRate: '', travelRate: '', minHours: '', notes: '', active: true
  });

  const handleEdit = (c: LaborClassification) => {
    setEditing(c);
    setFormData({
      name: c.name, billingCode: c.billingCode || '', baseRate: String(c.baseRate),
      overtimeRate: c.overtimeRate ? String(c.overtimeRate) : '', doubleTimeRate: c.doubleTimeRate ? String(c.doubleTimeRate) : '',
      stormRate: c.stormRate ? String(c.stormRate) : '', emergencyRate: c.emergencyRate ? String(c.emergencyRate) : '',
      perDiemRate: c.perDiemRate ? String(c.perDiemRate) : '', travelRate: c.travelRate ? String(c.travelRate) : '',
      minHours: c.minimumBillableHours ? String(c.minimumBillableHours) : '', notes: c.notes || '', active: c.active
    });
    setOpen(true);
  };

  const handleSave = () => {
    const payload = {
      companyId,
      name: formData.name,
      billingCode: formData.billingCode || undefined,
      baseRate: Number(formData.baseRate) || 0,
      overtimeRate: Number(formData.overtimeRate) || undefined,
      doubleTimeRate: Number(formData.doubleTimeRate) || undefined,
      stormRate: Number(formData.stormRate) || undefined,
      emergencyRate: Number(formData.emergencyRate) || undefined,
      perDiemRate: Number(formData.perDiemRate) || undefined,
      travelRate: Number(formData.travelRate) || undefined,
      minimumBillableHours: Number(formData.minHours) || undefined,
      notes: formData.notes || undefined,
      active: formData.active
    };

    if (editing) {
      updateMutation.mutate({ endpoint: `/api/labor-classifications/${editing.id}`, body: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/labor-classifications?companyId=${companyId}`] });
          setOpen(false);
        }
      });
    } else {
      saveMutation.mutate({ body: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/labor-classifications?companyId=${companyId}`] });
          setOpen(false);
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure?")) {
      deleteMutation.mutate({ endpoint: `/api/labor-classifications/${id}` }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/labor-classifications?companyId=${companyId}`] });
        }
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold uppercase">Labor Classes</h2>
        <Sheet open={open} onOpenChange={(val) => { setOpen(val); if (!val) setEditing(null); }}>
          <SheetTrigger asChild>
            <Button className="h-12 uppercase font-bold" onClick={() => {
              setEditing(null);
              setFormData({ name: '', billingCode: '', baseRate: '', overtimeRate: '', doubleTimeRate: '', stormRate: '', emergencyRate: '', perDiemRate: '', travelRate: '', minHours: '', notes: '', active: true });
            }}>
              <Plus className="w-5 h-5 md:mr-2"/> <span className="hidden md:inline">Add Class</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90dvh] md:h-full md:w-[500px] md:side-right overflow-y-auto px-4 md:px-6">
            <SheetHeader className="mb-6">
              <SheetTitle className="uppercase tracking-wide font-extrabold">{editing ? 'Edit' : 'Add'} Labor Class</SheetTitle>
            </SheetHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input className="h-12" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Lineman" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Billing Code</Label>
                  <Input className="h-12" value={formData.billingCode} onChange={e => setFormData({...formData, billingCode: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Base Rate ($/hr) *</Label>
                  <Input className="h-12" type="number" value={formData.baseRate} onChange={e => setFormData({...formData, baseRate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>OT Rate</Label>
                  <Input className="h-12" type="number" value={formData.overtimeRate} onChange={e => setFormData({...formData, overtimeRate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>DT Rate</Label>
                  <Input className="h-12" type="number" value={formData.doubleTimeRate} onChange={e => setFormData({...formData, doubleTimeRate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Storm Rate</Label>
                  <Input className="h-12" type="number" value={formData.stormRate} onChange={e => setFormData({...formData, stormRate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Per Diem</Label>
                  <Input className="h-12" type="number" value={formData.perDiemRate} onChange={e => setFormData({...formData, perDiemRate: e.target.value})} />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-4">
                <Switch checked={formData.active} onCheckedChange={c => setFormData({...formData, active: c})} />
                <Label>Active Classification</Label>
              </div>
              <Button className="w-full h-14 text-lg uppercase font-bold" onClick={handleSave} disabled={!formData.name || !formData.baseRate || saveMutation.isPending || updateMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="animate-spin w-5 h-5"/> : 'Save'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary"/></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes?.map(c => (
            <Card key={c.id} className={`shadow-sm border-border ${!c.active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 md:p-6 flex flex-col justify-between h-full gap-4">
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-bold">{c.name}</h3>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleEdit(c)}><Edit2 className="w-4 h-4"/></Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(c.id)}><Trash2 className="w-4 h-4"/></Button>
                    </div>
                  </div>
                  {c.billingCode && <p className="text-xs font-mono text-muted-foreground mt-1">Code: {c.billingCode}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-secondary/50 p-2 rounded">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Base</div>
                    <div className="font-mono text-lg">${c.baseRate}/hr</div>
                  </div>
                  <div className="bg-secondary/50 p-2 rounded">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">OT</div>
                    <div className="font-mono text-lg">${c.overtimeRate || c.baseRate}/hr</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!classes || classes.length === 0) && (
            <div className="col-span-full py-12 text-center text-muted-foreground">No labor classifications found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function EquipmentTab({ companyId }: { companyId: number }) {
  // Mock placeholder for equipment settings tab using the same pattern
  return <div className="py-8 text-center text-muted-foreground">Equipment catalog setup (implement similar to Labor)</div>;
}

function BillableItemsTab({ companyId }: { companyId: number }) {
  // Mock placeholder
  return <div className="py-8 text-center text-muted-foreground">Billable items setup (implement similar to Labor)</div>;
}

function TemplatesTab({ companyId }: { companyId: number }) {
  // Mock placeholder
  return <div className="py-8 text-center text-muted-foreground">Report Templates setup (implement similar to Labor)</div>;
}
