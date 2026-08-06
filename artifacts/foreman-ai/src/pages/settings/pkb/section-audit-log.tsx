import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Clock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface AuditEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  changedBy: string;
  changedAt: string;
  before: any;
  after: any;
  companyId: number;
}

const ACTION_COLORS: Record<string, string> = {
  create:     "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  update:     "bg-blue-500/20 text-blue-400 border-blue-500/30",
  delete:     "bg-red-500/20 text-red-400 border-red-500/30",
  activate:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  deactivate: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  duplicate:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function formatEntityType(type: string) {
  return type.replace(/_/g, " ").replace(/pkb /gi, "").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function DiffView({ before, after }: { before: any; after: any }) {
  if (!before && !after) return null;
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changed = Array.from(keys).filter(k => {
    const b = JSON.stringify((before ?? {})[k]);
    const a = JSON.stringify((after ?? {})[k]);
    return b !== a;
  });
  if (changed.length === 0) return <span className="text-muted-foreground text-xs">No field changes recorded</span>;
  return (
    <div className="space-y-1">
      {changed.slice(0, 8).map(k => (
        <div key={k} className="flex gap-2 text-xs">
          <span className="text-muted-foreground w-28 shrink-0 font-medium truncate">{k}</span>
          <span className="text-red-400 line-through truncate max-w-[120px]">
            {JSON.stringify((before ?? {})[k]) ?? "—"}
          </span>
          <span className="text-emerald-400 truncate max-w-[120px]">
            {JSON.stringify((after ?? {})[k]) ?? "—"}
          </span>
        </div>
      ))}
      {changed.length > 8 && (
        <p className="text-xs text-muted-foreground">+{changed.length - 8} more changes</p>
      )}
    </div>
  );
}

export function SectionAuditLog({ companyId }: { companyId: number | null | undefined }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["pkb-audit", companyId],
    queryFn: () =>
      fetch(`${BASE()}/api/pkb/audit-log?companyId=${companyId}`).then(r =>
        r.ok ? r.json() : []
      ),
    enabled: !!companyId,
  });

  const filtered = (data ?? []).filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.entityType.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      (e.changedBy ?? "").toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold uppercase tracking-tight">Audit Log</h2>
        <p className="text-muted-foreground font-medium text-sm mt-0.5">
          Complete history of every change to the Pole Knowledge Center — append-only, never deleted.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by entity type, action, or user…"
          className="pl-9 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-3 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          <Clock className="h-8 w-8" />
          {search ? `No audit entries match "${search}"` : "No audit entries yet. Changes will appear here as you modify the knowledge base."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="border border-border rounded-xl overflow-hidden bg-card"
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
              >
                <Badge
                  variant="outline"
                  className={cn("text-xs capitalize shrink-0", ACTION_COLORS[entry.action] ?? "")}
                >
                  {entry.action}
                </Badge>
                <span className="font-bold text-sm flex-1 truncate">
                  {formatEntityType(entry.entityType)} #{entry.entityId}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                  {entry.changedBy ?? "system"}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(entry.changedAt)}
                </span>
              </button>

              {expanded === entry.id && (
                <div className="px-4 pb-4 pt-1 border-t border-border bg-secondary/20">
                  <DiffView before={entry.before} after={entry.after} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
