import { useState } from "react";
import { Link } from "wouter";
import { 
  useGetReport, getGetReportQueryKey, 
  useListTimeEntries, getListTimeEntriesQueryKey,
  useListReportMaterials, getListReportMaterialsQueryKey,
  useListReportEquipment, getListReportEquipmentQueryKey,
} from "@workspace/api-client-react";
import { useApiQuery } from "@/hooks/use-api";
import { Loader2, Printer, Edit2, CheckCircle2, AlertTriangle, Users, Package, Truck, HardHat, ChevronDown, Camera, ZoomIn, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import PoleBillingReview from "./pole-billing-review";

const PHOTO_CATEGORY_LABELS: Record<string, string> = {
  full_pole: "Full Pole", pole_tag: "Pole Tag / Stamp", top_framing: "Top Framing",
  transformer: "Transformer / Equipment", base: "Pole Base", damage: "Damage",
  before_work: "Before Work", during_work: "During Work", after_work: "After Work", other: "Other",
};

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white bg-white/10 rounded-full p-2 hover:bg-white/20" onClick={onClose}><X className="h-6 w-6" /></button>
      <img src={url} alt="Full view" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function ReportDetailPage({ id }: { id: number }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: report, isLoading: isReportLoading } = useGetReport(id, {
    query: { enabled: !!id, queryKey: getGetReportQueryKey(id) }
  });

  const { data: timeEntries = [], isLoading: isTimeLoading } = useListTimeEntries(id, {
    query: { enabled: !!id, queryKey: getListTimeEntriesQueryKey(id) }
  });

  const { data: materials = [], isLoading: isMatLoading } = useListReportMaterials(id, {
    query: { enabled: !!id, queryKey: getListReportMaterialsQueryKey(id) }
  });

  const { data: equipment = [], isLoading: isEqLoading } = useListReportEquipment(id, {
    query: { enabled: !!id, queryKey: getListReportEquipmentQueryKey(id) }
  });

  const { data: photos = [] } = useApiQuery<any[]>(`/api/reports/${id}/photos`, !!id);

  const isLoading = isReportLoading || isTimeLoading || isMatLoading || isEqLoading;

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!report) return <div>Report not found</div>;

  return (
    <div className="pb-24 md:pb-8 space-y-4 md:space-y-8">
      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      <div className="flex flex-col justify-start gap-2 mb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight uppercase">Daily Report</h1>
          <Badge variant={report.status === 'complete' ? 'complete' : 'draft'} className="text-xs uppercase tracking-wider px-2 py-1">
            {report.status}
          </Badge>
        </div>
        <p className="text-muted-foreground font-bold text-base md:text-lg">
          {format(new Date(report.reportDate), 'MMM do, yyyy')}
        </p>
      </div>

      <div className="hidden md:flex gap-3 mb-6">
        <Link href={`/reports/${id}/print`}>
          <Button variant="outline" className="font-bold gap-2"><Printer className="h-4 w-4" /> Print</Button>
        </Link>
        {report.status === 'draft' && (
          <Link href={`/reports/${id}/edit`}>
            <Button className="font-bold gap-2"><Edit2 className="h-4 w-4" /> Edit Draft</Button>
          </Link>
        )}
      </div>

      <Collapsible defaultOpen className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 md:p-6 bg-secondary/20 hover:bg-secondary/40 font-bold uppercase tracking-widest text-sm">
          <div className="flex items-center gap-2"><HardHat className="w-5 h-5 text-primary"/> General Info</div>
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 md:p-6 border-t border-border grid grid-cols-2 gap-y-4 gap-x-6">
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Project</div>
              <div className="font-bold text-lg">{report.projectName || 'Not specified'}</div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Crew</div>
              <div className="font-bold">{report.crewName || 'Not specified'}</div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Foreman</div>
              <div className="font-bold">{report.foremanName || '-'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Description</div>
              <div className="font-medium text-sm md:text-base whitespace-pre-wrap bg-secondary/20 p-3 rounded">{report.workPerformed || 'No description'}</div>
            </div>
            <div className="col-span-2 flex flex-col md:flex-row gap-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                {report.safetyMeeting ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                <span className="font-bold text-sm">Safety Meeting {report.safetyMeeting ? 'Held' : 'Not Held'}</span>
              </div>
              <div className="flex items-center gap-2">
                {report.injuries ? <AlertTriangle className="w-5 h-5 text-destructive" /> : <CheckCircle2 className="w-5 h-5 text-green-500" />}
                <span className={`font-bold text-sm ${report.injuries ? 'text-destructive' : ''}`}>{report.injuries ? 'Injuries Occurred' : 'No Injuries'}</span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 md:p-6 bg-secondary/20 hover:bg-secondary/40 font-bold uppercase tracking-widest text-sm">
          <div className="flex items-center gap-2"><Users className="w-5 h-5 text-primary"/> Labor Hours <Badge variant="secondary" className="ml-2">{timeEntries.length}</Badge></div>
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 md:p-4 border-t border-border">
            {timeEntries.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground font-medium">No hours logged.</div>
            ) : (
              <div className="space-y-2">
                {timeEntries.map(entry => (
                  <div key={entry.id} className="bg-background border border-border p-3 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="font-bold">{entry.employeeName}</div>
                      <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{entry.trade}</div>
                    </div>
                    <div className="flex gap-4 text-center">
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Reg</div>
                        <div className="font-mono font-bold">{entry.regularHours}</div>
                      </div>
                      {(entry.overtimeHours || 0) > 0 && (
                        <div>
                          <div className="text-[10px] text-muted-foreground font-bold uppercase">OT</div>
                          <div className="font-mono font-bold">{entry.overtimeHours}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 md:p-6 bg-secondary/20 hover:bg-secondary/40 font-bold uppercase tracking-widest text-sm">
          <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-primary"/> Equipment <Badge variant="secondary" className="ml-2">{equipment.length}</Badge></div>
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 md:p-4 border-t border-border">
            {equipment.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground font-medium">No equipment logged.</div>
            ) : (
              <div className="space-y-2">
                {equipment.map(item => (
                  <div key={item.id} className="bg-background border border-border p-3 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="font-bold">{item.name}</div>
                      {item.unitId && <div className="text-xs text-muted-foreground font-mono">{item.unitId}</div>}
                    </div>
                    <div className="text-center bg-secondary/30 px-3 py-1 rounded">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Hours</div>
                      <div className="font-mono font-bold">{item.hoursUsed}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 md:p-6 bg-secondary/20 hover:bg-secondary/40 font-bold uppercase tracking-widest text-sm">
          <div className="flex items-center gap-2"><Package className="w-5 h-5 text-primary"/> Materials <Badge variant="secondary" className="ml-2">{materials.length}</Badge></div>
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 md:p-4 border-t border-border">
            {materials.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground font-medium">No materials logged.</div>
            ) : (
              <div className="space-y-2">
                {materials.map(item => (
                  <div key={item.id} className="bg-background border border-border p-3 rounded-lg flex justify-between items-center">
                    <div className="font-bold">{item.name}</div>
                    <div className="font-mono font-bold">{item.quantity} <span className="text-muted-foreground text-sm ml-1">{item.unit}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <PoleBillingReview reportId={id} />

      {/* Photos */}
      <Collapsible defaultOpen={photos.length > 0} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 md:p-6 bg-secondary/20 hover:bg-secondary/40 font-bold uppercase tracking-widest text-sm">
          <div className="flex items-center gap-2"><Camera className="w-5 h-5 text-primary"/> Photo Evidence <Badge variant="secondary" className="ml-2">{photos.length}</Badge></div>
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 md:p-4 border-t border-border">
            {photos.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground font-medium">
                No photos attached.{report.status === 'draft' && <span> <Link href={`/reports/${id}/edit`} className="text-primary underline font-bold">Edit report</Link> to add photos.</span>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((photo: any) => (
                  <button
                    key={photo.id}
                    onClick={() => setLightboxUrl(photo.url)}
                    className="group relative rounded-xl overflow-hidden border border-border bg-muted aspect-square"
                    title={PHOTO_CATEGORY_LABELS[photo.category] ?? "Photo"}
                  >
                    <img src={photo.url} alt={photo.caption || PHOTO_CATEGORY_LABELS[photo.category] || "Photo"} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-start p-2">
                      <span className="text-white text-[10px] font-bold uppercase tracking-wide bg-black/50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {PHOTO_CATEGORY_LABELS[photo.category ?? "other"] ?? "Photo"}
                      </span>
                    </div>
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black/50 rounded-full p-1"><ZoomIn className="h-3 w-3 text-white" /></div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Sticky Bottom Actions on Mobile */}
      <div className="fixed bottom-[80px] left-0 right-0 p-4 bg-background/90 backdrop-blur-md border-t border-border z-10 md:hidden flex gap-3">
        <Link href={`/reports/${id}/print`} className="flex-1">
          <Button variant="outline" className="w-full h-14 font-bold uppercase tracking-wider"><Printer className="w-5 h-5 mr-2" /> Print</Button>
        </Link>
        {report.status === 'draft' && (
          <Link href={`/reports/${id}/edit`} className="flex-1">
            <Button className="w-full h-14 font-bold uppercase tracking-wider"><Edit2 className="w-5 h-5 mr-2" /> Edit</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
