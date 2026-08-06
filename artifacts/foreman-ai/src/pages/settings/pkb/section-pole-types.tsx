import { useCompanyStore } from "@/hooks/use-company-store";
import { usePkbList } from "./pkb-hooks";
import { PkbTable, StatusBadge, type ColumnConfig, type FieldConfig } from "./pkb-table";

const COLUMNS: ColumnConfig[] = [
  { key: "name", label: "Name", render: r => <span className="font-bold">{r.name}</span> },
  { key: "code", label: "Code", render: r => <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{r.code}</span> },
  { key: "material", label: "Material", render: r => <span className="capitalize">{r.material}</span> },
  { key: "nominalHeight", label: "Height", render: r => r.nominalHeight ? `${r.nominalHeight}ft` : "—" },
  { key: "poleClass", label: "Class", render: r => r.poleClass ? `Class ${r.poleClass}` : "—" },
  { key: "accessType", label: "Access", render: r => <span className="capitalize">{r.accessType ?? "—"}</span> },
  { key: "customerId", label: "Customer" },
  { key: "versionStatus", label: "Status", render: r => <StatusBadge status={r.versionStatus} isActive={r.isActive} /> },
];

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Pole Type Name", type: "text", required: true, placeholder: "e.g. 45ft Class 3 Wood Tangent" },
  { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g. PT-W45C3", helperText: "Unique identifier used in work packages and billing mappings." },
  { key: "material", label: "Material", type: "select", required: true, options: [
    { value: "wood", label: "Wood" },
    { value: "steel", label: "Steel" },
    { value: "concrete", label: "Concrete" },
    { value: "composite", label: "Composite" },
  ]},
  { key: "nominalHeight", label: "Nominal Height (ft)", type: "number", placeholder: "e.g. 45" },
  { key: "poleClass", label: "Pole Class", type: "select", options: [
    { value: "1", label: "Class 1" },
    { value: "2", label: "Class 2" },
    { value: "3", label: "Class 3" },
    { value: "4", label: "Class 4" },
    { value: "5", label: "Class 5" },
    { value: "H1", label: "Class H1" },
    { value: "H2", label: "Class H2" },
  ]},
  { key: "operationalClass", label: "Operational Class", type: "select", options: [
    { value: "distribution", label: "Distribution" },
    { value: "transmission", label: "Transmission" },
    { value: "subtransmission", label: "Subtransmission" },
    { value: "service", label: "Service" },
  ]},
  { key: "accessType", label: "Access Type", type: "select", options: [
    { value: "roadside", label: "Roadside (standard)" },
    { value: "backyard", label: "Backyard / Restricted" },
    { value: "wetlands", label: "Wetlands" },
    { value: "steep_terrain", label: "Steep Terrain" },
    { value: "other", label: "Other" },
  ]},
  { key: "customerId", label: "Customer / Utility", type: "text", placeholder: "e.g. Red River Electric", helperText: "Pole types are customer-specific. Each utility may have different standards." },
  { key: "versionStatus", label: "Status", type: "select", required: true, options: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ]},
  { key: "description", label: "Description", type: "textarea", placeholder: "Optional notes about this pole type." },
];

export function SectionPoleTypes() {
  const { activeCompanyId } = useCompanyStore();
  const { data, isLoading } = usePkbList<any>("pole-types", activeCompanyId ?? undefined);

  return (
    <PkbTable
      entity="pole-types"
      title="Pole Types"
      singularLabel="Pole Type"
      data={data}
      isLoading={isLoading}
      columns={COLUMNS}
      fields={FIELDS}
      defaultValues={{ material: "wood", versionStatus: "draft", isActive: true }}
    />
  );
}
