import { useLocation, Link } from "wouter";
import { useUser } from "@clerk/react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useListCompanyMembers, getListCompanyMembersQueryKey, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Zap, Grid3X3, Puzzle, Wrench, Package, Image, DollarSign,
  Upload, ShieldCheck, Clock, Menu, X, ChevronRight, ArrowLeft, AlertCircle, Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { SectionPoleTypes } from "./section-pole-types";
import { SectionStructureConfigs } from "./section-structure-configs";
import { SectionComponents } from "./section-components";
import { SectionWorkActions } from "./section-work-actions";
import { SectionWorkPackages } from "./section-work-packages";
import { SectionBillingMappings } from "./section-billing-mappings";
import { SectionAuditLog } from "./section-audit-log";
import { SectionVisualReferences } from "./section-visual-references";
import { SectionTrainingExamples } from "./section-training-examples";
import { SectionCsvImport } from "./section-csv-import";

// ── Section registry ───────────────────────────────────────────────────────
const PKB_SECTIONS = [
  { id: "pole-types",       label: "Pole Types",              icon: Zap,         desc: "Define pole types, materials, heights, and classes for each customer standard." },
  { id: "structure-configs",label: "Structure Configurations",icon: Grid3X3,     desc: "Framing configurations: crossarms, conductors, guying requirements, and required photos." },
  { id: "components",       label: "Components",              icon: Puzzle,      desc: "Catalog of visible components: transformers, cutouts, arresters, conductors, and hardware." },
  { id: "work-actions",     label: "Work Actions",            icon: Wrench,      desc: "Actions that can be performed on poles or components, with evidence requirements." },
  { id: "work-packages",    label: "Work Packages",           icon: Package,     desc: "Combine pole types, structures, and actions into reusable billing templates." },
  { id: "visual-references",label: "Visual References",       icon: Image,       desc: "Upload and label reference photos for each structure configuration." },
  { id: "billing-mappings", label: "Billing Mappings",        icon: DollarSign,  desc: "Map work actions to billing codes, rates, and customer-specific rules." },
  { id: "import",           label: "Import & Export",         icon: Upload,      desc: "Bulk-load pole types, work packages, and billing mappings from CSV or XLSX." },
  { id: "validation",       label: "Configuration Validation",icon: ShieldCheck, desc: "Check your knowledge base for errors before activating templates." },
  { id: "audit-log",        label: "Audit Log",               icon: Clock,       desc: "Full history of every change to the Pole Knowledge Center." },
] as const;

type SectionId = typeof PKB_SECTIONS[number]["id"];

interface PkbSummary {
  poleTypes: number;
  structureConfigs: number;
  components: number;
  workActions: number;
  workPackages: number;
  billingMappings: number;
  visualReferences: number;
}

// ── Shared placeholder section ─────────────────────────────────────────────
function SectionPlaceholder({ section }: { section: typeof PKB_SECTIONS[number] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight">{section.label}</h2>
          <p className="text-muted-foreground mt-1 font-medium">{section.desc}</p>
        </div>
        <Button className="font-bold gap-2 uppercase tracking-wide" disabled>
          <section.icon className="h-4 w-4" /> Add {section.label.replace(/s$/, "")}
        </Button>
      </div>
      <div className="flex items-start gap-3 bg-secondary/40 border border-border rounded-lg p-4 text-sm">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">Coming in the next build</p>
          <p className="text-muted-foreground mt-0.5">
            The full {section.label} catalog editor is being built. The database tables and API endpoints are live — you can already POST to <code className="text-xs bg-secondary px-1 rounded">/api/pkb/{section.id}</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main PKB shell ─────────────────────────────────────────────────────────
export default function PoleKnowledgeCenterPage({ section: sectionId }: { section?: string }) {
  const { activeCompanyId } = useCompanyStore();
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Role check
  const { data: userProfile } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: companyMembers } = useListCompanyMembers(activeCompanyId!, {
    query: { enabled: !!activeCompanyId, queryKey: getListCompanyMembersQueryKey(activeCompanyId!) }
  });
  const currentMember = companyMembers?.find(m => m.userId === userProfile?.id);
  const role = currentMember?.role ?? "foreman";

  useEffect(() => {
    if (role === "foreman") {
      toast({ title: "Access denied", description: "Pole Knowledge Center is for admins and supervisors.", variant: "destructive" });
      setLocation("/dashboard");
    }
  }, [role]);

  // Summary — plain fetch (Clerk session cookie sent automatically)
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: summary } = useQuery<PkbSummary>({
    queryKey: ["pkb-summary", activeCompanyId],
    queryFn: () => fetch(`${BASE}/api/pkb/summary?companyId=${activeCompanyId}`).then(r => r.ok ? r.json() : null),
    enabled: !!activeCompanyId && role !== "foreman",
  });

  const activeSection = PKB_SECTIONS.find(s => s.id === sectionId) ?? PKB_SECTIONS[0];

  if (role === "foreman") {
    return <div className="flex items-center justify-center h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const NavList = () => (
    <div className="flex flex-col gap-1 py-2">
      {PKB_SECTIONS.map(s => {
        const isActive = s.id === activeSection.id;
        return (
          <Link key={s.id} href={`/settings/pkb/${s.id}`}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={cn("w-full justify-start h-10 text-sm gap-2", isActive && "font-bold")}
              onClick={() => setDrawerOpen(false)}
            >
              <s.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </Button>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
        <Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/settings/pkb" className="hover:text-foreground transition-colors">Pole Knowledge Center</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-bold">{activeSection.label}</span>
      </div>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight">Pole Knowledge Center</h1>
          <p className="text-muted-foreground font-medium mt-0.5">Red River Electric Utility — company-specific pole catalog</p>
        </div>
      </div>

      {/* Setup completeness banner */}
      {summary && (
        <div className="flex flex-wrap gap-3 p-4 bg-secondary/40 border border-border rounded-lg text-sm font-bold">
          {[
            ["Pole Types", summary.poleTypes],
            ["Structure Configs", summary.structureConfigs],
            ["Components", summary.components],
            ["Work Actions", summary.workActions],
            ["Work Packages", summary.workPackages],
            ["Billing Mappings", summary.billingMappings],
            ["Visual Refs", summary.visualReferences],
          ].map(([label, count]) => (
            <div key={label as string} className="flex items-center gap-1.5">
              <Badge variant={Number(count) > 0 ? "default" : "outline"} className="text-xs">{count as number}</Badge>
              <span className="text-muted-foreground font-medium">{label as string}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mobile drawer toggle */}
      <div className="md:hidden">
        <Button variant="outline" className="gap-2 font-bold" onClick={() => setDrawerOpen(true)}>
          <Menu className="h-4 w-4" /> {activeSection.label}
        </Button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-extrabold uppercase tracking-wide text-sm">Pole Knowledge Center</span>
              <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <NavList />
          </div>
        </div>
      )}

      {/* Main 2-column layout */}
      <div className="flex gap-8 items-start">
        {/* Desktop sidebar */}
        <div className="hidden md:block w-56 shrink-0">
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1">Sections</p>
            </div>
            <NavList />
            <div className="pb-2" />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {activeSection.id === "pole-types"        ? <SectionPoleTypes /> :
           activeSection.id === "structure-configs"  ? <SectionStructureConfigs /> :
           activeSection.id === "components"         ? <SectionComponents /> :
           activeSection.id === "work-actions"       ? <SectionWorkActions /> :
           activeSection.id === "work-packages"      ? <SectionWorkPackages /> :
           activeSection.id === "billing-mappings"   ? <SectionBillingMappings /> :
           activeSection.id === "visual-references"  ? <SectionVisualReferences /> :
           activeSection.id === "import"             ? <SectionCsvImport /> :
           activeSection.id === "validation"         ? <SectionTrainingExamples /> :
           activeSection.id === "audit-log"          ? <SectionAuditLog companyId={activeCompanyId} /> :
           <SectionPlaceholder section={activeSection} />}
        </div>
      </div>
    </div>
  );
}
