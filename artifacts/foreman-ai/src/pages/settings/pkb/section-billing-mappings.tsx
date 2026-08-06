import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList } from "./pkb-hooks";
import { PkbTable, StatusBadge, type ColumnConfig, type FieldConfig } from "./pkb-table";
import { Badge } from "@/components/ui/badge";

function UnitTypeBadge({ unit }: { unit: string }) {
  const colors: Record<string, string> = {
    each: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    hour: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    foot: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    day:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };
  return (
    <Badge variant="outline" className={`text-xs ${colors[unit] ?? ""}`}>
      {unit}
    </Badge>
  );
}

const COLUMNS: ColumnConfig[] = [
  { key: "workActionCode", label: "Work Action", render: r => (
    <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{r.workActionCode}</span>
  )},
  { key: "billingCode", label: "Billing Code", render: r => (
    <span className="font-mono text-xs text-primary">{r.billingCode}</span>
  )},
  { key: "description", label: "Description", render: r => (
    <span className="text-sm">{r.description}</span>
  )},
  { key: "unitType", label: "Unit", render: r => <UnitTypeBadge unit={r.unitType} /> },
  { key: "defaultQuantity", label: "Default Qty", render: r => String(r.defaultQuantity ?? 1) },
  { key: "unitRate", label: "Unit Rate", render: r => r.unitRate ? `$${Number(r.unitRate).toFixed(2)}` : "—" },
  { key: "customerId", label: "Customer" },
  { key: "versionStatus", label: "Status", render: r => <StatusBadge status={r.versionStatus} isActive={r.isActive} /> },
];

const FIELDS: FieldConfig[] = [
  { key: "workActionCode", label: "Work Action Code", type: "text", required: true, placeholder: "e.g. WA-POLE-INST", helperText: "Must match a code in the Work Actions catalog." },
  { key: "billingCode", label: "Billing Code", type: "text", required: true, placeholder: "e.g. RRE-POLE-SET-45C3", helperText: "Customer-specific billing line code." },
  { key: "description", label: "Description", type: "text", required: true, placeholder: "e.g. 45ft Class 3 Pole Set" },
  { key: "unitType", label: "Unit Type", type: "select", required: true, options: [
    { value: "each", label: "Each" },
    { value: "hour", label: "Hour" },
    { value: "foot", label: "Foot" },
    { value: "day", label: "Day" },
    { value: "lump_sum", label: "Lump Sum" },
  ]},
  { key: "defaultQuantity", label: "Default Quantity", type: "number", placeholder: "1", helperText: "Default qty suggested when this billing code is triggered." },
  { key: "minQuantity", label: "Minimum Quantity", type: "number", placeholder: "1" },
  { key: "unitRate", label: "Unit Rate ($)", type: "number", placeholder: "e.g. 850.00", helperText: "Optional reference rate. Actual billing may differ per contract." },
  { key: "customerId", label: "Customer / Utility", type: "text", placeholder: "e.g. Red River Electric", helperText: "Leave blank for global mapping." },
  { key: "versionStatus", label: "Status", type: "select", required: true, options: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ]},
];

export function SectionBillingMappings() {
  const { activeCompanyId } = useCompanyStore();
  const { data, isLoading } = usePkbList<any>("billing-mappings", activeCompanyId ?? undefined);

  return (
    <PkbTable
      entity="billing-mappings"
      title="Billing Mappings"
      singularLabel="Billing Mapping"
      data={data}
      isLoading={isLoading}
      columns={COLUMNS}
      fields={FIELDS}
      defaultValues={{ unitType: "each", defaultQuantity: 1, minQuantity: 1, versionStatus: "active", isActive: true }}
    />
  );
}
