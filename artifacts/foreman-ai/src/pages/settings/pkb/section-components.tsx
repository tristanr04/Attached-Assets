import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList } from "./pkb-hooks";
import { PkbTable, StatusBadge, type ColumnConfig, type FieldConfig } from "./pkb-table";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABELS: Record<string, string> = {
  pole_and_framing: "Pole & Framing",
  conductor_and_service: "Conductor & Service",
  transformer_equipment: "Transformer Equipment",
  guying_and_anchors: "Guying & Anchors",
  protection_and_switching: "Protection & Switching",
  grounding: "Grounding",
  hardware: "Hardware",
  other: "Other",
};

const COLUMNS: ColumnConfig[] = [
  { key: "name", label: "Name", render: r => <span className="font-bold">{r.name}</span> },
  { key: "code", label: "Code", render: r => <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{r.code}</span> },
  { key: "category", label: "Category", render: r => (
    <Badge variant="secondary" className="text-xs font-medium">
      {CATEGORY_LABELS[r.category] ?? r.category}
    </Badge>
  )},
  { key: "visualDescription", label: "Visual Description", render: r => (
    <span className="text-muted-foreground text-xs line-clamp-2">{r.visualDescription ?? "—"}</span>
  )},
  { key: "customerId", label: "Customer" },
  { key: "versionStatus", label: "Status", render: r => <StatusBadge status={r.versionStatus} isActive={r.isActive} /> },
];

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Component Name", type: "text", required: true, placeholder: "e.g. Single Transformer" },
  { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g. COMP-XFMR-1" },
  { key: "category", label: "Category", type: "select", required: true, options: Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })) },
  { key: "visualDescription", label: "Visual Description", type: "textarea", placeholder: "Describe how this component looks in a photo. Used for AI visual analysis.", helperText: "Be specific: color, shape, mounting position, identifying marks." },
  { key: "customerId", label: "Customer / Utility", type: "text", placeholder: "e.g. Red River Electric" },
  { key: "versionStatus", label: "Status", type: "select", required: true, options: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ]},
];

export function SectionComponents() {
  const { activeCompanyId } = useCompanyStore();
  const { data, isLoading } = usePkbList<any>("components", activeCompanyId ?? undefined);

  return (
    <PkbTable
      entity="components"
      title="Components"
      singularLabel="Component"
      data={data}
      isLoading={isLoading}
      columns={COLUMNS}
      fields={FIELDS}
      defaultValues={{ category: "pole_and_framing", versionStatus: "draft", isActive: true }}
    />
  );
}
