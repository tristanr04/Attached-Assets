import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList } from "./pkb-hooks";
import { PkbTable, StatusBadge, type ColumnConfig, type FieldConfig } from "./pkb-table";

const COLUMNS: ColumnConfig[] = [
  { key: "name", label: "Name", render: r => <span className="font-bold">{r.name}</span> },
  { key: "code", label: "Code", render: r => <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{r.code}</span> },
  { key: "phases", label: "Phases", render: r => r.phases ? `${r.phases}Φ` : "—" },
  { key: "crossarmConfig", label: "Crossarm", render: r => <span className="capitalize">{(r.crossarmConfig ?? "—").replace(/_/g, " ")}</span> },
  { key: "guyingRequirements", label: "Guying", render: r => <span className="capitalize">{(r.guyingRequirements ?? "—").replace(/_/g, " ")}</span> },
  { key: "customerId", label: "Customer" },
  { key: "versionStatus", label: "Status", render: r => <StatusBadge status={r.versionStatus} isActive={r.isActive} /> },
];

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Configuration Name", type: "text", required: true, placeholder: "e.g. Three-Phase Tangent" },
  { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g. SC-3PH-TAN" },
  { key: "phases", label: "Number of Phases", type: "select", required: true, options: [
    { value: "1", label: "1-Phase" },
    { value: "3", label: "3-Phase" },
  ]},
  { key: "conductorArrangement", label: "Conductor Arrangement", type: "select", options: [
    { value: "vertical", label: "Vertical" },
    { value: "horizontal", label: "Horizontal" },
    { value: "delta", label: "Delta" },
  ]},
  { key: "crossarmConfig", label: "Crossarm Configuration", type: "select", options: [
    { value: "none", label: "None" },
    { value: "single_crossarm", label: "Single Crossarm" },
    { value: "double_crossarm", label: "Double Crossarm" },
    { value: "fiberglass_arm", label: "Fiberglass Arm" },
  ]},
  { key: "guyingRequirements", label: "Guying Requirements", type: "select", options: [
    { value: "none", label: "None" },
    { value: "down_guy_anchor", label: "Down Guy & Anchor" },
    { value: "side_guy", label: "Side Guy" },
    { value: "head_guy", label: "Head Guy" },
    { value: "full_guying", label: "Full Guying" },
  ]},
  { key: "customerId", label: "Customer / Utility", type: "text", placeholder: "e.g. Red River Electric" },
  { key: "versionStatus", label: "Status", type: "select", required: true, options: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ]},
];

export function SectionStructureConfigs() {
  const { activeCompanyId } = useCompanyStore();
  const { data, isLoading } = usePkbList<any>("structure-configs", activeCompanyId ?? undefined);

  return (
    <PkbTable
      entity="structure-configs"
      title="Structure Configurations"
      singularLabel="Structure Configuration"
      data={data}
      isLoading={isLoading}
      columns={COLUMNS}
      fields={FIELDS}
      defaultValues={{ phases: "1", conductorArrangement: "vertical", crossarmConfig: "none", guyingRequirements: "none", versionStatus: "draft", isActive: true }}
    />
  );
}
