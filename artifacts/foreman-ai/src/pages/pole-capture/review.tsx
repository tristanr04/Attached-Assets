/**
 * Pole Analysis Review — foreman accepts, edits, or rejects each AI-proposed field,
 * then presses "Confirm Pole Analysis" to create the pre-filled report.
 *
 * GATE: Nothing is submitted, completed, or billed before this confirmation.
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2, XCircle, Pencil, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  MapPin, Cpu, RefreshCw, Camera, Tag, Wrench, Box, FileCheck, Layers, ShieldCheck,
  Building2, Zap, CircleDot, Fingerprint, Search, ScanLine, ImagePlus, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCompanyStore } from "@/hooks/use-company-store";
import { cn } from "@/lib/utils";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ────────────────────────────────────────────────────────────────────
type FieldStatus = "pending" | "accepted" | "edited" | "rejected";

interface ProposedField<T = unknown> {
  value: T;
  confidence: number;
  source: string;
  notes?: string;
}

interface ProposedFields {
  poleTag: ProposedField<string | null>;
  poleMaterial: ProposedField<string | null>;
  poleHeight: ProposedField<string | null>;
  poleClass: ProposedField<string | null>;
  topFramingType: ProposedField<string | null>;
  visibleEquipment: ProposedField<string[]>;
  completedWork: ProposedField<string | null>;
  materialsInstalled: ProposedField<Array<{ name: string; qty: number; unit: string }>>;
  requiredDocs: ProposedField<string[]>;
  poleCondition: ProposedField<string | null>;
  hazardsObserved: ProposedField<string[]>;
}

interface JobCandidate {
  projectId: number;
  projectName: string;
  confidence: number;
  method: string;
}

// ── Pole Identity Engine types ────────────────────────────────────────────────
interface SignalBreakdown {
  ocr: number;
  gpsM: number | null;
  gps: number;
  visual: number;
  refBoost: number;
  total: number;
}

interface IdentityCandidate {
  poleAssetId: number;
  poleNumber: string | null;
  utilityTag: string | null;
  confidence: number;
  signals: SignalBreakdown;
  evidence: string[];
}

type IdentityStatus = "identified" | "uncertain" | "needs_photo" | "no_assets";
type RequestedCapture = "pole_tag_closeup" | "full_pole_view" | "second_angle" | null;

interface IdentityResult {
  status: IdentityStatus;
  poleAssetId: number | null;
  candidates: IdentityCandidate[];
  requestedCapture: RequestedCapture;
}

interface Analysis {
  id: number;
  status: string;
  photoData: string;
  photoMimeType: string;
  ocrPoleTag: string | null;
  ocrConfidence: number | null;
  matchedProjectId: number | null;
  matchConfidence: number | null;
  matchMethod: string | null;
  matchCandidates: JobCandidate[] | null;
  matchedWorkPackageId: number | null;
  proposedFields: ProposedFields | null;
  errorMessage: string | null;
  linkedReportId: number | null;
  duplicateOfId: number | null;
  poleAssetId: number | null;
  identityResult: IdentityResult | null;
}

// ── Confidence helpers ────────────────────────────────────────────────────────
function confidenceColor(c: number) {
  if (c >= 0.85) return "bg-green-500/15 text-green-600 border-green-400/40";
  if (c >= 0.65) return "bg-yellow-500/15 text-yellow-600 border-yellow-400/40";
  return "bg-red-500/15 text-red-600 border-red-400/40";
}

function confidenceLabel(c: number) {
  if (c >= 0.85) return "High";
  if (c >= 0.65) return "Medium";
  return "Low";
}

function ConfidencePill({ confidence }: { confidence: number }) {
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", confidenceColor(confidence))}>
      {Math.round(confidence * 100)}% {confidenceLabel(confidence)}
    </span>
  );
}

// ── Field card ────────────────────────────────────────────────────────────────
interface FieldCardProps {
  label: string;
  icon: React.ReactNode;
  field: ProposedField;
  fieldKey: string;
  status: FieldStatus;
  editValue: string;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (val: string) => void;
  onCommitEdit: () => void;
  multiline?: boolean;
  required?: boolean;
  displayValue?: string;
}

function FieldCard({
  label, icon, field, fieldKey, status, editValue,
  onAccept, onReject, onEdit, onCommitEdit, multiline, required, displayValue,
}: FieldCardProps) {
  const [editing, setEditing] = useState(false);

  const valueStr = displayValue ?? (
    Array.isArray(field.value)
      ? (field.value as any[]).map(v =>
          typeof v === "object" ? `${v.qty} ${v.unit} ${v.name}` : String(v)
        ).join(", ")
      : field.value != null ? String(field.value) : "—"
  );

  const handleEdit = () => {
    setEditing(true);
    onEdit(
      Array.isArray(field.value)
        ? (field.value as any[]).map(v =>
            typeof v === "object" ? `${v.qty} ${v.unit} ${v.name}` : String(v)
          ).join("\n")
        : field.value != null ? String(field.value) : ""
    );
  };

  const handleCommit = () => {
    setEditing(false);
    onCommitEdit();
  };

  return (
    <div className={cn(
      "border rounded-xl p-4 transition-all",
      status === "accepted" ? "border-green-500/40 bg-green-500/5" :
      status === "edited"   ? "border-blue-500/40 bg-blue-500/5" :
      status === "rejected" ? "border-border bg-muted/20 opacity-60" :
                              "border-border bg-card",
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <span className="font-semibold text-sm">{label}</span>
          {required && <span className="text-red-500 text-xs font-bold">*</span>}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold border-primary/40 text-primary">
            AI Proposed
          </Badge>
        </div>
        <ConfidencePill confidence={field.confidence} />
      </div>

      {/* Value display */}
      {!editing ? (
        <div className={cn("text-sm mb-3 rounded-lg px-3 py-2 font-medium",
          status === "rejected" ? "line-through text-muted-foreground" : "bg-muted/40"
        )}>
          {valueStr || <span className="text-muted-foreground italic">Not detected</span>}
          {status === "edited" && (
            <span className="ml-2 text-xs text-blue-500 font-bold">(edited)</span>
          )}
        </div>
      ) : (
        <div className="mb-3 space-y-2">
          {multiline ? (
            <Textarea
              value={editValue}
              onChange={e => onEdit(e.target.value)}
              className="text-sm min-h-[80px]"
              autoFocus
            />
          ) : (
            <Input
              value={editValue}
              onChange={e => onEdit(e.target.value)}
              className="text-sm h-9"
              autoFocus
            />
          )}
          <Button size="sm" onClick={handleCommit} className="h-7 text-xs">Save Edit</Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={status === "accepted" ? "default" : "outline"}
          className={cn("h-8 text-xs gap-1 flex-1", status === "accepted" && "bg-green-600 hover:bg-green-700 border-green-600")}
          onClick={onAccept}
          disabled={editing}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-8 text-xs gap-1 flex-1", status === "edited" && "border-blue-500 text-blue-500")}
          onClick={handleEdit}
          disabled={editing}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant={status === "rejected" ? "destructive" : "outline"}
          className="h-8 text-xs gap-1 flex-1"
          onClick={onReject}
          disabled={editing}
        >
          <XCircle className="h-3.5 w-3.5" />
          Reject
        </Button>
      </div>
    </div>
  );
}

// ── Pole Identity Panel ───────────────────────────────────────────────────────
const CAPTURE_LABELS: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  pole_tag_closeup: {
    icon: <ScanLine className="h-6 w-6 text-amber-500" />,
    title: "Take a Pole-Tag Close-Up",
    description: "Move closer to the pole and photograph the tag or number plate directly. A clear, well-lit close-up lets the engine read the ID precisely.",
  },
  full_pole_view: {
    icon: <ImagePlus className="h-6 w-6 text-amber-500" />,
    title: "Take a Full-Pole Photo",
    description: "Step back so the entire pole is visible from base to top. This helps the engine match framing, equipment and surrounding landmarks.",
  },
  second_angle: {
    icon: <Search className="h-6 w-6 text-amber-500" />,
    title: "Capture a Second Angle",
    description: "Photograph the pole from a different direction or distance. Multiple angles give the engine stronger visual evidence.",
  },
};

interface PoleIdentityPanelProps {
  result: IdentityResult | null;
  selectedPoleAssetId: number | null;
  onSelectAsset: (id: number, poleNumber: string | null) => void;
  onTakeNewPhoto: () => void;
}

function PoleIdentityPanel({ result, selectedPoleAssetId, onSelectAsset, onTakeNewPhoto }: PoleIdentityPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  if (result.status === "no_assets") {
    return (
      <div className="flex items-start gap-3 bg-muted/40 border border-border rounded-xl px-4 py-3">
        <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">No poles registered yet.</span>{" "}
          Confirming this analysis will start building your company's pole registry. Future captures will match against it automatically.
        </div>
      </div>
    );
  }

  if (result.status === "needs_photo" && result.candidates.length === 0) {
    const capture = result.requestedCapture ? CAPTURE_LABELS[result.requestedCapture] : null;
    return (
      <div className="border border-amber-500/40 bg-amber-500/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-amber-500" />
          <span className="font-bold text-sm text-amber-600">Can't Identify Pole</span>
        </div>
        {capture ? (
          <div className="flex items-start gap-3">
            {capture.icon}
            <div>
              <div className="font-semibold text-sm">{capture.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{capture.description}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not enough signal to identify the pole. You can still confirm with a manual selection.</p>
        )}
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-amber-500/40" onClick={onTakeNewPhoto}>
          <Camera className="h-3.5 w-3.5" />
          {capture?.title ?? "Take Another Photo"}
        </Button>
      </div>
    );
  }

  if (result.status === "identified" && result.candidates[0]) {
    const top = result.candidates[0];
    const label = top.poleNumber ?? top.utilityTag ?? `Asset #${top.poleAssetId}`;
    return (
      <div className="border border-green-500/40 bg-green-500/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-green-500" />
            <span className="font-bold text-sm text-green-600">Pole Identified</span>
            <Badge className="bg-green-500/15 text-green-700 border-green-400/40 border text-[10px] font-bold px-1.5 py-0">
              {Math.round(top.confidence * 100)}% Confidence
            </Badge>
          </div>
          <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Evidence
          </button>
        </div>

        <div className="flex items-center gap-2 font-mono font-black text-lg">{label}</div>

        <div className="flex flex-wrap gap-1.5">
          {top.signals.ocr >= 0.28 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 border border-green-400/30 font-semibold">
              OCR ✓
            </span>
          )}
          {top.signals.gps >= 0.20 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 border border-green-400/30 font-semibold">
              GPS ✓ {top.signals.gpsM != null ? `(${Math.round(top.signals.gpsM)}m)` : ""}
            </span>
          )}
          {top.signals.visual >= 0.12 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 border border-green-400/30 font-semibold">
              Visual ✓
            </span>
          )}
          {top.signals.refBoost > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 border border-green-400/30 font-semibold">
              {Math.round(top.signals.refBoost / 0.01)} verified photo{top.signals.refBoost > 0.01 ? "s" : ""}
            </span>
          )}
        </div>

        {expanded && (
          <div className="space-y-1 border-t border-green-500/20 pt-2">
            {top.evidence.map((ev, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                {ev}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Photo will be added as a verified reference after confirmation, improving future identifications.
        </p>
      </div>
    );
  }

  // uncertain or needs_photo with candidates
  const capture = result.requestedCapture ? CAPTURE_LABELS[result.requestedCapture] : null;
  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-yellow-500" />
          <span className="font-bold text-sm">Uncertain — Choose the Correct Pole</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{result.candidates.length} candidate{result.candidates.length > 1 ? "s" : ""}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Multiple poles match these signals. Select the correct pole below, or take a better photo.
      </p>

      <div className="space-y-2">
        {result.candidates.map(c => {
          const label = c.poleNumber ?? c.utilityTag ?? `Asset #${c.poleAssetId}`;
          const isSelected = selectedPoleAssetId === c.poleAssetId;
          return (
            <div
              key={c.poleAssetId}
              className={cn(
                "border rounded-xl p-3 cursor-pointer transition-all space-y-2",
                isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30",
              )}
              onClick={() => onSelectAsset(c.poleAssetId, c.poleNumber)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isSelected
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <CircleDot className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-mono font-bold text-sm">{label}</span>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                  c.confidence >= 0.65 ? "bg-yellow-500/15 text-yellow-600 border-yellow-400/40"
                    : "bg-muted/40 text-muted-foreground border-border",
                )}>
                  {Math.round(c.confidence * 100)}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {c.evidence.map((ev, i) => (
                  <span key={i} className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {capture && (
        <div className="border-t border-border pt-3 flex items-start gap-3">
          {capture.icon}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold">{capture.title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{capture.description}</div>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 gap-1.5" onClick={onTakeNewPhoto}>
            <Camera className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Job match card ────────────────────────────────────────────────────────────
interface JobMatchCardProps {
  candidates: JobCandidate[] | null;
  selectedProjectId: number | null;
  matchConfidence: number | null;
  matchMethod: string | null;
  onSelect: (id: number, name: string) => void;
}

function JobMatchCard({ candidates, selectedProjectId, matchConfidence, matchMethod, onSelect }: JobMatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const top = candidates?.[0] ?? null;

  const methodLabel: Record<string, string> = {
    pole_tag: "Pole tag match",
    schedule: "Schedule match",
    gps: "GPS proximity",
    manual: "Manual",
    none: "No match",
  };

  return (
    <div className="border border-primary/40 rounded-xl p-4 bg-primary/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm">Job Match</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold border-primary/40 text-primary">
            AI Proposed
          </Badge>
          <span className="text-[10px] text-muted-foreground">{matchMethod ? methodLabel[matchMethod] ?? matchMethod : ""}</span>
        </div>
        {matchConfidence != null && (
          <ConfidencePill confidence={matchConfidence} />
        )}
      </div>

      {top ? (
        <div className="space-y-2">
          <div className={cn(
            "rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 border cursor-pointer transition-all",
            selectedProjectId === top.projectId
              ? "border-green-500/50 bg-green-500/10"
              : "border-border hover:border-primary/40",
          )}
            onClick={() => onSelect(top.projectId, top.projectName)}
          >
            <div className="flex items-center gap-2">
              {selectedProjectId === top.projectId
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <CircleDot className="h-4 w-4 text-muted-foreground" />}
              <span className="font-semibold text-sm">{top.projectName}</span>
            </div>
            <span className="text-xs text-muted-foreground">{Math.round(top.confidence * 100)}% match</span>
          </div>

          {(candidates?.length ?? 0) > 1 && (
            <button
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {candidates!.length - 1} other candidate{candidates!.length - 1 > 1 ? "s" : ""}
            </button>
          )}

          {expanded && candidates && (
            <div className="space-y-1 border-t border-border pt-2">
              {candidates.slice(1).map(c => (
                <div
                  key={c.projectId}
                  className={cn(
                    "rounded-lg px-3 py-2 flex items-center justify-between gap-2 border cursor-pointer transition-all",
                    selectedProjectId === c.projectId
                      ? "border-green-500/50 bg-green-500/10"
                      : "border-border hover:border-primary/40",
                  )}
                  onClick={() => onSelect(c.projectId, c.projectName)}
                >
                  <div className="flex items-center gap-2">
                    {selectedProjectId === c.projectId
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      : <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm">{c.projectName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{Math.round(c.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">No matching job found — select manually below</div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
interface Props { id: number }

export default function PoleAnalysisReviewPage({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyStore();

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Per-field state
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, FieldStatus>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  // Pole identity: auto-set when engine status === "identified"; foreman can override in "uncertain"
  const [selectedPoleAssetId, setSelectedPoleAssetId] = useState<number | null>(null);

  // Load analysis
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE()}/api/pole-capture/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: Analysis = await res.json();
      setAnalysis(data);

      // Pre-select top project candidate
      if (data.matchedProjectId) {
        const top = data.matchCandidates?.[0];
        setSelectedProjectId(data.matchedProjectId);
        setSelectedProjectName(top?.projectName ?? null);
      }

      // Pre-select pole asset when engine auto-identified it
      if (data.identityResult?.status === "identified" && data.identityResult.poleAssetId) {
        setSelectedPoleAssetId(data.identityResult.poleAssetId);
      } else if (data.poleAssetId) {
        setSelectedPoleAssetId(data.poleAssetId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  // Poll while analyzing
  useEffect(() => {
    if (!analysis || analysis.status !== "analyzing") return;
    const t = setTimeout(loadAnalysis, 2500);
    return () => clearTimeout(t);
  }, [analysis, loadAnalysis]);

  // Already confirmed → redirect to report
  useEffect(() => {
    if (analysis?.status === "confirmed" && analysis.linkedReportId) {
      navigate(`/reports/${analysis.linkedReportId}/edit`);
    }
  }, [analysis, navigate]);

  const fields = analysis?.proposedFields;

  // All field keys we track
  const FIELD_KEYS = [
    "poleTag", "poleMaterial", "poleHeight", "poleClass", "topFramingType",
    "visibleEquipment", "completedWork", "materialsInstalled", "requiredDocs",
    "poleCondition", "hazardsObserved",
  ];

  const getStatus = (key: string): FieldStatus => fieldStatuses[key] ?? "pending";
  const setStatus = (key: string, s: FieldStatus) =>
    setFieldStatuses(prev => ({ ...prev, [key]: s }));
  const setEdit = (key: string, val: string) =>
    setEditValues(prev => ({ ...prev, [key]: val }));

  const acceptAll = () => {
    const next: Record<string, FieldStatus> = {};
    FIELD_KEYS.forEach(k => { next[k] = "accepted"; });
    setFieldStatuses(next);
  };

  // How many fields are still pending?
  const pendingCount = FIELD_KEYS.filter(k => getStatus(k) === "pending").length;
  const allReviewed = pendingCount === 0;

  // Confirm gate: need a project selected + all fields reviewed
  const canConfirm = allReviewed && !!selectedProjectId;

  const handleConfirm = async () => {
    if (!canConfirm || !analysis) return;
    setConfirming(true);
    try {
      const payload = {
        projectId: selectedProjectId,
        fieldStatuses,
        editValues,
        ...(selectedPoleAssetId != null ? { poleAssetId: selectedPoleAssetId } : {}),
      };
      const res = await fetch(`${BASE()}/api/pole-capture/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }
      const { reportId } = await res.json();
      toast({ title: "Pole analysis confirmed", description: "Your report has been pre-filled." });
      navigate(`/reports/${reportId}/edit`);
    } catch (err: any) {
      toast({ title: "Confirmation failed", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`${BASE()}/api/pole-capture/${id}/retry`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      await loadAnalysis();
    } catch (err: any) {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="font-semibold text-muted-foreground">Loading analysis…</span>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Could not load analysis</h2>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button onClick={loadAnalysis}>Try Again</Button>
      </div>
    );
  }

  if (analysis.status === "analyzing") {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-primary/15">
            <Cpu className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Analyzing Pole…</h2>
          <p className="text-muted-foreground">Reading pole tag · Identifying equipment · Matching to registered poles · Linking to active job</p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
      </div>
    );
  }

  if (analysis.status === "error") {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Analysis Failed</h2>
        <p className="text-muted-foreground text-sm">{analysis.errorMessage ?? "Unknown error"}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate("/pole-capture")}>
            <Camera className="h-4 w-4 mr-2" /> Take New Photo
          </Button>
          <Button onClick={handleRetry} disabled={retrying}>
            {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Retry Analysis
          </Button>
        </div>
      </div>
    );
  }

  if (!fields) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
        <h2 className="text-xl font-bold">No Proposed Fields</h2>
        <p className="text-muted-foreground text-sm">The analysis returned no data. Try retaking the photo with better lighting.</p>
        <Button onClick={() => navigate("/pole-capture")}>
          <Camera className="h-4 w-4 mr-2" /> Take New Photo
        </Button>
      </div>
    );
  }

  // ── Duplicate warning ──────────────────────────────────────────────────────
  const isDuplicate = !!analysis.duplicateOfId;

  // ── Review UI ──────────────────────────────────────────────────────────────
  const photoSrc = `data:${analysis.photoMimeType};base64,${analysis.photoData}`;

  return (
    <div className="max-w-5xl mx-auto pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-black text-base uppercase tracking-tight">Pole Analysis Review</span>
          </div>
          {isDuplicate && (
            <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-400/40 border text-xs">
              Possible Duplicate
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {pendingCount} field{pendingCount > 1 ? "s" : ""} pending
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={acceptAll}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Accept All
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-0">
        {/* ── Left: Photo ────────────────────────────────────────────────── */}
        <div className="lg:w-[42%] lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto p-4">
          <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
            <img
              src={photoSrc}
              alt="Captured pole"
              className="w-full object-cover"
            />
          </div>

          {/* OCR pill */}
          {analysis.ocrPoleTag && (
            <div className="mt-3 flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2">
              <Tag className="h-4 w-4 text-primary" />
              <div>
                <div className="text-xs font-bold text-primary uppercase tracking-wide">OCR Pole Tag</div>
                <div className="text-lg font-black font-mono">{analysis.ocrPoleTag}</div>
              </div>
              {analysis.ocrConfidence != null && (
                <ConfidencePill confidence={Number(analysis.ocrConfidence)} />
              )}
            </div>
          )}

          {/* GPS */}
          {analysis.photoMimeType && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>Photo preserved · Full audit trail kept</span>
            </div>
          )}

          {isDuplicate && (
            <Card className="mt-3 border-yellow-500/40 bg-yellow-500/5">
              <CardContent className="p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-yellow-600 mb-0.5">Possible Duplicate</div>
                  <div className="text-muted-foreground">
                    This pole tag was analyzed earlier today. Review carefully before confirming.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Fields ───────────────────────────────────────────────── */}
        <div className="lg:flex-1 p-4 space-y-3">
          {/* Instruction banner */}
          <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
            <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Review each AI-proposed field. <strong className="text-foreground">Accept</strong> to keep it,{" "}
              <strong className="text-foreground">Edit</strong> to change the value, or{" "}
              <strong className="text-foreground">Reject</strong> to discard it.
              Nothing is saved until you press <strong className="text-foreground">Confirm Pole Analysis</strong>.
            </p>
          </div>

          {/* Pole Identity Engine panel */}
          <PoleIdentityPanel
            result={analysis.identityResult}
            selectedPoleAssetId={selectedPoleAssetId}
            onSelectAsset={(assetId) => setSelectedPoleAssetId(assetId)}
            onTakeNewPhoto={() => navigate("/pole-capture")}
          />

          {/* Job match */}
          <JobMatchCard
            candidates={analysis.matchCandidates}
            selectedProjectId={selectedProjectId}
            matchConfidence={analysis.matchConfidence != null ? Number(analysis.matchConfidence) : null}
            matchMethod={analysis.matchMethod}
            onSelect={(id, name) => { setSelectedProjectId(id); setSelectedProjectName(name); }}
          />

          {/* Pole identity */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Pole Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <FieldCard
                label="Pole Tag" icon={<Tag className="h-4 w-4" />}
                field={fields.poleTag as ProposedField} fieldKey="poleTag"
                status={getStatus("poleTag")} editValue={editValues.poleTag ?? ""}
                onAccept={() => setStatus("poleTag", "accepted")}
                onReject={() => setStatus("poleTag", "rejected")}
                onEdit={(v) => setEdit("poleTag", v)}
                onCommitEdit={() => setStatus("poleTag", "edited")}
                required
              />
              <FieldCard
                label="Pole Material" icon={<Layers className="h-4 w-4" />}
                field={fields.poleMaterial as ProposedField} fieldKey="poleMaterial"
                status={getStatus("poleMaterial")} editValue={editValues.poleMaterial ?? ""}
                onAccept={() => setStatus("poleMaterial", "accepted")}
                onReject={() => setStatus("poleMaterial", "rejected")}
                onEdit={(v) => setEdit("poleMaterial", v)}
                onCommitEdit={() => setStatus("poleMaterial", "edited")}
              />
              <FieldCard
                label="Pole Height" icon={<Layers className="h-4 w-4" />}
                field={fields.poleHeight as ProposedField} fieldKey="poleHeight"
                status={getStatus("poleHeight")} editValue={editValues.poleHeight ?? ""}
                onAccept={() => setStatus("poleHeight", "accepted")}
                onReject={() => setStatus("poleHeight", "rejected")}
                onEdit={(v) => setEdit("poleHeight", v)}
                onCommitEdit={() => setStatus("poleHeight", "edited")}
              />
              <FieldCard
                label="Pole Class" icon={<Layers className="h-4 w-4" />}
                field={fields.poleClass as ProposedField} fieldKey="poleClass"
                status={getStatus("poleClass")} editValue={editValues.poleClass ?? ""}
                onAccept={() => setStatus("poleClass", "accepted")}
                onReject={() => setStatus("poleClass", "rejected")}
                onEdit={(v) => setEdit("poleClass", v)}
                onCommitEdit={() => setStatus("poleClass", "edited")}
              />
              <FieldCard
                label="Top Framing" icon={<Layers className="h-4 w-4" />}
                field={fields.topFramingType as ProposedField} fieldKey="topFramingType"
                status={getStatus("topFramingType")} editValue={editValues.topFramingType ?? ""}
                onAccept={() => setStatus("topFramingType", "accepted")}
                onReject={() => setStatus("topFramingType", "rejected")}
                onEdit={(v) => setEdit("topFramingType", v)}
                onCommitEdit={() => setStatus("topFramingType", "edited")}
              />
            </CardContent>
          </Card>

          {/* Work details */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Work Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <FieldCard
                label="Visible Equipment" icon={<Wrench className="h-4 w-4" />}
                field={fields.visibleEquipment as ProposedField} fieldKey="visibleEquipment"
                status={getStatus("visibleEquipment")} editValue={editValues.visibleEquipment ?? ""}
                onAccept={() => setStatus("visibleEquipment", "accepted")}
                onReject={() => setStatus("visibleEquipment", "rejected")}
                onEdit={(v) => setEdit("visibleEquipment", v)}
                onCommitEdit={() => setStatus("visibleEquipment", "edited")}
                multiline
              />
              <FieldCard
                label="Completed Work" icon={<Zap className="h-4 w-4" />}
                field={fields.completedWork as ProposedField} fieldKey="completedWork"
                status={getStatus("completedWork")} editValue={editValues.completedWork ?? ""}
                onAccept={() => setStatus("completedWork", "accepted")}
                onReject={() => setStatus("completedWork", "rejected")}
                onEdit={(v) => setEdit("completedWork", v)}
                onCommitEdit={() => setStatus("completedWork", "edited")}
                multiline required
              />
              <FieldCard
                label="Materials Installed" icon={<Box className="h-4 w-4" />}
                field={fields.materialsInstalled as ProposedField} fieldKey="materialsInstalled"
                status={getStatus("materialsInstalled")} editValue={editValues.materialsInstalled ?? ""}
                onAccept={() => setStatus("materialsInstalled", "accepted")}
                onReject={() => setStatus("materialsInstalled", "rejected")}
                onEdit={(v) => setEdit("materialsInstalled", v)}
                onCommitEdit={() => setStatus("materialsInstalled", "edited")}
                multiline
              />
              <FieldCard
                label="Required Documentation" icon={<FileCheck className="h-4 w-4" />}
                field={fields.requiredDocs as ProposedField} fieldKey="requiredDocs"
                status={getStatus("requiredDocs")} editValue={editValues.requiredDocs ?? ""}
                onAccept={() => setStatus("requiredDocs", "accepted")}
                onReject={() => setStatus("requiredDocs", "rejected")}
                onEdit={(v) => setEdit("requiredDocs", v)}
                onCommitEdit={() => setStatus("requiredDocs", "edited")}
              />
            </CardContent>
          </Card>

          {/* Safety */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Safety
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <FieldCard
                label="Pole Condition" icon={<ShieldCheck className="h-4 w-4" />}
                field={fields.poleCondition as ProposedField} fieldKey="poleCondition"
                status={getStatus("poleCondition")} editValue={editValues.poleCondition ?? ""}
                onAccept={() => setStatus("poleCondition", "accepted")}
                onReject={() => setStatus("poleCondition", "rejected")}
                onEdit={(v) => setEdit("poleCondition", v)}
                onCommitEdit={() => setStatus("poleCondition", "edited")}
              />
              <FieldCard
                label="Hazards Observed" icon={<AlertTriangle className="h-4 w-4" />}
                field={fields.hazardsObserved as ProposedField} fieldKey="hazardsObserved"
                status={getStatus("hazardsObserved")} editValue={editValues.hazardsObserved ?? ""}
                onAccept={() => setStatus("hazardsObserved", "accepted")}
                onReject={() => setStatus("hazardsObserved", "rejected")}
                onEdit={(v) => setEdit("hazardsObserved", v)}
                onCommitEdit={() => setStatus("hazardsObserved", "edited")}
                multiline
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Floating confirm bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            {!selectedProjectId ? (
              <p className="text-sm font-medium text-yellow-500 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Select a matching job above
              </p>
            ) : pendingCount > 0 ? (
              <p className="text-sm font-medium text-muted-foreground">
                {FIELD_KEYS.length - pendingCount}/{FIELD_KEYS.length} fields reviewed
              </p>
            ) : (
              <p className="text-sm font-semibold text-green-500 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                All fields reviewed — ready to confirm
              </p>
            )}
          </div>
          <Button
            size="lg"
            className="h-14 px-6 text-base font-bold shadow-2xl shadow-primary/30 gap-2 whitespace-nowrap"
            disabled={!canConfirm || confirming}
            onClick={handleConfirm}
          >
            {confirming ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Confirming…</>
            ) : (
              <><ShieldCheck className="h-5 w-5" /> Confirm Pole Analysis</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
