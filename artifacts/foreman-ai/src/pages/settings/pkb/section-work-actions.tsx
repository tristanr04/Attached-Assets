import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList } from "./pkb-hooks";
import { PkbTable, StatusBadge, type ColumnConfig, type FieldConfig } from "./pkb-table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  install:  { label: "Install",   color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  remove:   { label: "Remove",    color: "bg-red-500/20 text-red-400 border-red-500/30" },
  transfer: { label: "Transfer",  color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  inspect:  { label: "Inspect",   color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  repair:   { label: "Repair",    color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  replace:  { label: "Replace",   color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  other:    { label: "Other",     color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
};

const COLUMNS: ColumnConfig[] = [
  { key: "name", label: "Name", render: r => <span className="font-bold">{r.name}</span> },
  { key: "code", label: "Code", render: r => <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{r.code}</span> },
  { key: "componentCode", label: "Component" },
  { key: "actionType", label: "Action", render: r => {
    const m = ACTION_TYPE_LABELS[r.actionType] ?? ACTION_TYPE_LABELS.other;
    return <Badge variant="outline" className={`text-xs ${m.color}`}>{m.label}</Badge>;
  }},
  { key: "requiresHumanConfirmation", label: "Human Confirm", render: r => r.requiresHumanConfirmation
    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    : <XCircle className="h-4 w-4 text-muted-foreground" />
  },
  { key: "customerId", label: "Customer" },
  { key: "versionStatus", label: "Status", render: r => <StatusBadge status={r.versionStatus} isActive={r.isActive} /> },
];

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Work Action Name", type: "text", required: true, placeholder: "e.g. Install Down Guy & Anchor" },
  { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g. WA-GUY-INST" },
  { key: "componentCode", label: "Component Code", type: "text", placeholder: "e.g. COMP-GUY-DWN", helperText: "Code of the component this action applies to." },
  { key: "actionType", label: "Action Type", type: "select", required: true, options: Object.entries(ACTION_TYPE_LABELS).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: "description", label: "Description", type: "textarea", required: true, placeholder: "What physical work is performed?" },
  { key: "visibleEvidence", label: "Visible Evidence", type: "textarea", placeholder: "What should be visible in the after-photo to confirm this was done?", helperText: "Used for AI photo validation." },
  { key: "requiresHumanConfirmation", label: "Requires Human Confirmation", type: "select", options: [
    { value: "true", label: "Yes — foreman must confirm" },
    { value: "false", label: "No — AI can auto-confirm" },
  ]},
  { key: "customerId", label: "Customer / Utility", type: "text", placeholder: "e.g. Red River Electric" },
  { key: "versionStatus", label: "Status", type: "select", required: true, options: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ]},
];

export function SectionWorkActions() {
  const { activeCompanyId } = useCompanyStore();
  const { data, isLoading } = usePkbList<any>("work-actions", activeCompanyId ?? undefined);

  return (
    <PkbTable
      entity="work-actions"
      title="Work Actions"
      singularLabel="Work Action"
      data={data}
      isLoading={isLoading}
      columns={COLUMNS}
      fields={FIELDS}
      defaultValues={{ actionType: "install", requiresHumanConfirmation: "true", versionStatus: "draft", isActive: true }}
    />
  );
}
