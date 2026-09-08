"use client";

/**
 * Shared phase UI for the teams and participants tables.
 *
 * Both tables already carry a `Set<string>` selection and a bulk bar, so these
 * pieces slot into what is there rather than each page re-implementing the
 * move semantics. All the actual rules live server-side in `src/lib/phases.ts`
 * — this only calls /api/admin/phases/assign and reports what came back.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, AlertTriangle, RotateCcw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../../../components/ui/use-toast";

export interface PhaseRef {
  id: string;
  name: string;
  order: number;
  isDisabled: boolean;
}

export type MoveMode = "set" | "next" | "previous" | "fail" | "clear";

/** Loads the phase list once per page. */
export function usePhases() {
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/phases", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setPhases((data.phases || []).map((p: PhaseRef) => ({ id: p.id, name: p.name, order: p.order, isDisabled: p.isDisabled })));
    } catch {
      /* the tables stay usable without phases */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { phases, loaded, reload };
}

/** The phase cell: name, plus a marker when the row is failed or the phase is off. */
export function PhaseBadge({
  phase,
  phaseStatus,
}: {
  phase?: { name: string; isDisabled?: boolean } | null;
  phaseStatus?: string | null;
}) {
  if (!phase) return <span className="text-xs text-muted-foreground">—</span>;
  const failed = phaseStatus === "failed";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={failed ? "destructive" : "secondary"} className="whitespace-nowrap text-xs">
        {phase.name}
      </Badge>
      {failed && <AlertTriangle className="h-3 w-3 text-destructive" aria-label="متعثّر" />}
      {phase.isDisabled && <Ban className="h-3 w-3 text-muted-foreground" aria-label="مرحلة معطّلة" />}
    </div>
  );
}

async function callAssign(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/phases/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "تعذر تنفيذ العملية");
  return data as { moved: number; atBoundary: number; unassigned: number };
}

/** Turns the API's counters into one honest sentence. */
function describe(result: { moved: number; atBoundary: number; unassigned: number }) {
  const parts = [`تم نقل ${result.moved}`];
  if (result.atBoundary > 0) parts.push(`${result.atBoundary} في نهاية المسار`);
  if (result.unassigned > 0) parts.push(`${result.unassigned} بدون مرحلة`);
  return parts.join(" · ");
}

/** Per-row ← / → move. `kind` decides which id list the API receives. */
export function PhaseRowMove({
  id,
  kind,
  disabled,
  onDone,
}: {
  id: string;
  kind: "team" | "participant";
  disabled?: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const move = async (mode: "next" | "previous") => {
    setBusy(true);
    try {
      const ids = kind === "team" ? { teamIds: [id] } : { participantIds: [id] };
      const result = await callAssign({ ...ids, mode });
      if (result.moved === 0) {
        toast({
          title: "لم يتم النقل",
          description: result.unassigned > 0 ? "لا توجد مرحلة محددة" : "هذه نهاية المسار",
          variant: "warning",
        });
      } else {
        toast({ title: mode === "next" ? "تم النقل للمرحلة التالية" : "تم النقل للمرحلة السابقة", variant: "success" });
      }
      onDone();
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "خطأ", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* RTL: the previous phase sits to the right, the next to the left. */}
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy || disabled}
              onClick={() => move("previous")} title="المرحلة السابقة" aria-label="المرحلة السابقة">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy || disabled}
              onClick={() => move("next")} title="المرحلة التالية" aria-label="المرحلة التالية">
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** The bulk bar controls: assign to a phase, step next/previous, fail, clear. */
export function PhaseBulkActions({
  ids,
  kind,
  phases,
  onDone,
}: {
  ids: string[];
  kind: "team" | "participant";
  phases: PhaseRef[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (mode: MoveMode, phaseId?: string) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const idPayload = kind === "team" ? { teamIds: ids } : { participantIds: ids };
      const result = await callAssign({ ...idPayload, mode, phaseId });
      toast({
        title:
          mode === "fail" ? "تم وضع علامة متعثّر"
          : mode === "clear" ? "تم إزالة المرحلة"
          : "تم تحديث المرحلة",
        description: describe(result),
        variant: result.moved > 0 ? "success" : "warning",
      });
      onDone();
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "خطأ", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (phases.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2 sm:border-t-0 sm:pt-0">
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        disabled={busy}
        value=""
        onChange={(e) => { if (e.target.value) run("set", e.target.value); e.target.value = ""; }}
        aria-label="نقل إلى مرحلة"
      >
        <option value="">نقل إلى مرحلة…</option>
        {phases.map((p) => (
          <option key={p.id} value={p.id}>{p.name}{p.isDisabled ? " (معطّلة)" : ""}</option>
        ))}
      </select>
      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => run("previous")}>
        <ChevronRight className="h-3.5 w-3.5" />
        السابقة
      </Button>
      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => run("next")}>
        <ChevronLeft className="h-3.5 w-3.5" />
        التالية
      </Button>
      <Button size="sm" variant="outline" className="gap-1 text-amber-600" disabled={busy} onClick={() => run("fail")}>
        <AlertTriangle className="h-3.5 w-3.5" />
        متعثّر
      </Button>
      <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={() => run("clear")}>
        <RotateCcw className="h-3.5 w-3.5" />
        إزالة المرحلة
      </Button>
    </div>
  );
}

/** Filter dropdown: a specific phase, no phase, or only the failed rows. */
export function PhaseFilter({
  value,
  onChange,
  phases,
}: {
  value: string;
  onChange: (value: string) => void;
  phases: PhaseRef[];
}) {
  if (phases.length === 0) return null;
  return (
    <select
      className="h-10 rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="تصفية حسب المرحلة"
    >
      <option value="all">كل المراحل</option>
      <option value="none">بدون مرحلة</option>
      <option value="failed">المتعثّرون فقط</option>
      {phases.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

/** The matching client-side predicate for `PhaseFilter`. */
export function matchesPhaseFilter(
  row: { phaseId?: string | null; phaseStatus?: string | null },
  filter: string
): boolean {
  if (filter === "all") return true;
  if (filter === "none") return !row.phaseId;
  if (filter === "failed") return row.phaseStatus === "failed";
  return row.phaseId === filter;
}
