/**
 * CSV/XLSX Bulk Import — Task #22
 * Upload a CSV or Excel file to bulk-import pole types, structure configs,
 * components, work actions, or billing mappings.
 * The backend processes the file row-by-row and creates/updates records.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyStore } from "@/hooks/use-company-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, ChevronUp, Download, RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

const ENTITY_TYPES = [
  { value: "pole-types",       label: "Pole Types",         headers: "name,material,heightFt,operationalClass,accessType,customerCode" },
  { value: "structure-configs",label: "Structure Configs",  headers: "name,code,phases,conductorArrangement,crossarmType" },
  { value: "components",       label: "Components",          headers: "name,code,category,unit,visualDescription" },
  { value: "work-actions",     label: "Work Actions",        headers: "name,code,actionType,defaultUnit,defaultRate" },
  { value: "billing-mappings", label: "Billing Mappings",   headers: "workActionCode,billingCode,description,unitType,unitRate" },
];

interface ImportJob {
  id: number;
  entityType: string;
  status: "pending" | "processing" | "completed" | "failed";
  insertedCount: number | null;
  updatedCount: number | null;
  skippedCount: number | null;
  errorCount: number | null;
  results: any[] | null;
  createdAt: string;
}

function JobStatusBadge({ status }: { status: ImportJob["status"] }) {
  const cfg = {
    pending:    { label: "Pending",    cls: "bg-secondary text-muted-foreground" },
    processing: { label: "Processing", cls: "bg-blue-500/10 text-blue-600 border-blue-400/40" },
    completed:  { label: "Complete",   cls: "bg-green-500/10 text-green-600 border-green-400/40" },
    failed:     { label: "Failed",     cls: "bg-red-500/10 text-red-600 border-red-400/40" },
  };
  const c = cfg[status] ?? cfg.pending;
  return <Badge variant="outline" className={cn("text-xs font-bold", c.cls)}>{c.label}</Badge>;
}

function JobCard({ job }: { job: ImportJob }) {
  const [showErrors, setShowErrors] = useState(false);
  const entityLabel = ENTITY_TYPES.find(e => e.value === job.entityType)?.label ?? job.entityType;
  const successCount = (job.insertedCount ?? 0) + (job.updatedCount ?? 0);

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm">{entityLabel}</span>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(job.createdAt).toLocaleString()}
              {job.totalRows != null && ` · ${job.totalRows} rows`}
              {job.status === "completed" && job.insertedCount != null && (
                <> · <span className="text-green-600 font-bold">{successCount} imported</span>
                {(job.errorCount ?? 0) > 0 && <>, <span className="text-red-500 font-bold">{job.errorCount} errors</span></>}
                </>
              )}
            </p>
          </div>
          {(job.results?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowErrors(v => !v)}
              className="text-xs font-bold text-destructive flex items-center gap-1 hover:underline"
            >
              {showErrors ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {job.results!.length} errors
            </button>
          )}
        </div>

        {showErrors && job.results && (
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            {job.results.slice(0, 20).map((err, i) => (
              <div key={i} className="text-xs flex gap-2">
                <span className="text-muted-foreground shrink-0">Row {err.row ?? i + 2}:</span>
                <span className="text-destructive">{err.message ?? String(err)}</span>
              </div>
            ))}
            {job.results.length > 20 && (
              <p className="text-xs text-muted-foreground">…and {job.results.length - 20} more errors.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── CSV template download ────────────────────────────────────────────────────
function downloadTemplate(entityType: string, headers: string) {
  const csv = headers + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `redline-${entityType}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main section ──────────────────────────────────────────────────────────────
export function SectionCsvImport() {
  const { activeCompanyId } = useCompanyStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [entityType, setEntityType] = useState("pole-types");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<ImportJob[]>({
    queryKey: ["pkb-import-jobs", activeCompanyId],
    queryFn: () =>
      fetch(`${BASE()}/api/pkb/import-jobs?companyId=${activeCompanyId}`)
        .then(r => r.ok ? r.json() : []),
    enabled: !!activeCompanyId,
    refetchInterval: (q: any) => {
      const items: ImportJob[] = q.state.data ?? [];
      return items.some((j: ImportJob) => j.status === "processing" || j.status === "pending") ? 3000 : false;
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const res = await fetch(`${BASE()}/api/pkb/import-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, entityType, csvData: text }),
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pkb-import-jobs", activeCompanyId] });
      setSelectedFile(null);
      setPreviewRows([]);
      toast({ title: "Import started", description: "Check the job list below for progress." });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  function handleFile(file: File) {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast({ title: "Use CSV format", description: "XLSX support requires server-side processing. Export your Excel file as CSV first.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    // Preview first 5 rows
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target!.result as string;
      const rows = text.split("\n").slice(0, 6).map(r => r.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
      setPreviewRows(rows);
    };
    reader.readAsText(file);
  }

  const currentEntity = ENTITY_TYPES.find(e => e.value === entityType) ?? ENTITY_TYPES[0];

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" /> CSV Bulk Import
          </h2>
          <p className="text-muted-foreground font-medium text-sm mt-0.5">
            Import pole types, components, work actions, and billing mappings from a spreadsheet.
          </p>
        </div>
        <Button
          variant="outline"
          className="font-bold gap-2"
          onClick={() => qc.invalidateQueries({ queryKey: ["pkb-import-jobs", activeCompanyId] })}
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Upload card */}
      <Card className="border-border mb-6">
        <CardContent className="p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-5 items-end">
            <div className="space-y-2">
              <Label className="font-bold text-sm">Import Type</Label>
              <Select value={entityType} onValueChange={v => { setEntityType(v); setSelectedFile(null); setPreviewRows([]); }}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="font-bold gap-2 h-12"
              onClick={() => downloadTemplate(currentEntity.value, currentEntity.headers)}
            >
              <Download className="h-4 w-4" /> Download CSV Template
            </Button>
          </div>

          <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2 font-mono">
            Required columns: <span className="text-foreground font-bold">{currentEntity.headers}</span>
          </div>

          {/* Drop zone */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-secondary/20"
            )}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="font-bold text-sm">Drop CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv files · Max 5 MB</p>
          </div>

          {/* Preview */}
          {selectedFile && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <span className="font-bold text-sm">{selectedFile.name}</span>
                <Badge variant="secondary" className="text-xs">{(selectedFile.size / 1024).toFixed(1)} KB</Badge>
              </div>

              {previewRows.length > 0 && (
                <div className="overflow-auto border border-border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/40">
                        {(previewRows[0] ?? []).map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(1, 5).map((row, ri) => (
                        <tr key={ri} className="border-t border-border">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewRows.length > 5 && (
                    <p className="text-xs text-muted-foreground px-3 py-1.5 border-t border-border">…showing first 4 data rows</p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="font-bold"
                  onClick={() => { setSelectedFile(null); setPreviewRows([]); }}
                  disabled={importMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="font-bold gap-2"
                  onClick={() => importMutation.mutate(selectedFile)}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                    : <><Upload className="h-4 w-4" /> Start Import</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job history */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Import History</p>
        {jobsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (jobs as ImportJob[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 border border-dashed border-border rounded-xl text-muted-foreground">
            <FileSpreadsheet className="h-8 w-8 opacity-20" />
            <p className="text-sm font-bold">No imports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(jobs as ImportJob[]).map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </>
  );
}
