/**
 * Generic PKB entity table with create/edit dialog, activate/deactivate toggle,
 * duplicate, and delete. Used by Pole Types, Structure Configs, Components, Work Actions.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, MoreVertical, Pencil, Copy, Trash2, PowerOff, Zap, Loader2, Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  usePkbCreate, usePkbUpdate, usePkbDelete, usePkbActivate, usePkbDuplicate
} from "./pkb-hooks";
import { useCompanyStore } from "@/hooks/use-company-store";

// ── Field descriptor ────────────────────────────────────────────────────────
export type FieldConfig = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  helperText?: string;
  showInTable?: boolean;
};

// ── Column descriptor ───────────────────────────────────────────────────────
export type ColumnConfig = {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
  className?: string;
};

// ── Props ───────────────────────────────────────────────────────────────────
export interface PkbTableProps {
  entity: string;        // API path segment, e.g. "pole-types"
  title: string;
  singularLabel: string;
  data: any[] | undefined;
  isLoading: boolean;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  defaultValues?: Record<string, any>;
}

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, isActive }: { status: string; isActive: boolean }) {
  if (!isActive) return <Badge variant="outline" className="text-xs">Inactive</Badge>;
  const map: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    draft: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    archived: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };
  return (
    <Badge variant="outline" className={cn("text-xs", map[status] ?? map.draft)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ── Form dialog ─────────────────────────────────────────────────────────────
function PkbFormDialog({
  open, onClose, entity, fields, defaultValues, initial, singularLabel,
}: {
  open: boolean;
  onClose: () => void;
  entity: string;
  fields: FieldConfig[];
  defaultValues: Record<string, any>;
  initial?: any;
  singularLabel: string;
}) {
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyStore();
  const isEdit = !!initial;

  const [form, setForm] = useState<Record<string, any>>(
    initial ?? { ...defaultValues, companyId: activeCompanyId }
  );

  const create = usePkbCreate(entity);
  const update = usePkbUpdate(entity);

  function set(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({ id: initial.id, data: form });
        toast({ title: `${singularLabel} updated` });
      } else {
        await create.mutateAsync(form);
        toast({ title: `${singularLabel} created` });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight">
            {isEdit ? `Edit ${singularLabel}` : `New ${singularLabel}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key} className="font-bold text-sm">
                {f.label}{f.required && <span className="text-destructive ml-1">*</span>}
              </Label>

              {f.type === "textarea" ? (
                <Textarea
                  id={f.key}
                  value={form[f.key] ?? ""}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="text-sm"
                  rows={3}
                  required={f.required}
                />
              ) : f.type === "select" ? (
                <Select
                  value={form[f.key] ?? ""}
                  onValueChange={v => set(f.key, v)}
                  required={f.required}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={f.placeholder ?? `Select ${f.label}…`} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options?.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "number" ? (
                <Input
                  id={f.key}
                  type="number"
                  value={form[f.key] ?? ""}
                  onChange={e => set(f.key, Number(e.target.value))}
                  placeholder={f.placeholder}
                  className="text-sm"
                  required={f.required}
                />
              ) : (
                <Input
                  id={f.key}
                  value={form[f.key] ?? ""}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="text-sm"
                  required={f.required}
                />
              )}

              {f.helperText && (
                <p className="text-xs text-muted-foreground">{f.helperText}</p>
              )}
            </div>
          ))}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="font-bold">Cancel</Button>
            <Button type="submit" className="font-bold gap-2" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : `Create ${singularLabel}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main table ───────────────────────────────────────────────────────────────
export function PkbTable({
  entity, title, singularLabel, data, isLoading, columns, fields, defaultValues = {},
}: PkbTableProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const del = usePkbDelete(entity);
  const activate = usePkbActivate(entity);
  const duplicate = usePkbDuplicate(entity);
  const updateItem = usePkbUpdate<any>(entity);

  const filtered = (data ?? []).filter(row => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(row.name ?? "").toLowerCase().includes(q) ||
      String(row.code ?? "").toLowerCase().includes(q) ||
      String(row.description ?? "").toLowerCase().includes(q)
    );
  });

  async function handleDelete(row: any) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    try {
      await del.mutateAsync(row.id);
      toast({ title: `${singularLabel} deleted` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleToggleActive(row: any) {
    try {
      if (row.isActive) {
        await updateItem.mutateAsync({ id: row.id, data: { isActive: false } });
        toast({ title: `${singularLabel} deactivated` });
      } else {
        await activate.mutateAsync(row.id);
        toast({ title: `${singularLabel} activated` });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDuplicate(row: any) {
    try {
      await duplicate.mutateAsync(row.id);
      toast({ title: `${singularLabel} duplicated` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight">{title}</h2>
          <p className="text-muted-foreground font-medium text-sm mt-0.5">
            {filtered.length} of {(data ?? []).length} {title.toLowerCase()}
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="font-bold gap-2 uppercase tracking-wide"
        >
          <Plus className="h-4 w-4" /> Add {singularLabel}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className="pl-9 text-sm"
        />
      </div>

      {/* Table (desktop) / Card stack (mobile) */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          {search ? `No ${title.toLowerCase()} match "${search}"` : `No ${title.toLowerCase()} yet — add the first one above.`}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  {columns.map(c => (
                    <th key={c.key} className={cn("text-left px-4 py-3 font-bold text-xs uppercase tracking-wide", c.className)}>
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border last:border-0",
                      !row.isActive && "opacity-60",
                      i % 2 === 0 ? "bg-card" : "bg-secondary/20"
                    )}
                  >
                    {columns.map(c => (
                      <td key={c.key} className={cn("px-4 py-3", c.className)}>
                        {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                      </td>
                    ))}
                    <td className="px-2 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(row); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(row)}>
                            <Copy className="h-4 w-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggleActive(row)}>
                            {row.isActive ? (
                              <><PowerOff className="h-4 w-4 mr-2" /> Deactivate</>
                            ) : (
                              <><Zap className="h-4 w-4 mr-2" /> Activate</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {filtered.map(row => (
              <div
                key={row.id}
                className={cn(
                  "border border-border rounded-xl p-4 bg-card space-y-2",
                  !row.isActive && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{row.name}</p>
                    {row.code && <p className="text-xs text-muted-foreground font-mono">{row.code}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={row.versionStatus} isActive={row.isActive} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing(row); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(row)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleToggleActive(row)}>
                          {row.isActive ? <><PowerOff className="h-4 w-4 mr-2" /> Deactivate</> : <><Zap className="h-4 w-4 mr-2" /> Activate</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(row)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {columns.filter(c => !["name", "code"].includes(c.key)).map(c => (
                  <div key={c.key} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-28 shrink-0">{c.label}</span>
                    <span className="font-medium">{c.render ? c.render(row) : String(row[c.key] ?? "—")}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit dialog */}
      <PkbFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        entity={entity}
        fields={fields}
        defaultValues={defaultValues}
        initial={editing}
        singularLabel={singularLabel}
      />
    </>
  );
}

export { StatusBadge };
