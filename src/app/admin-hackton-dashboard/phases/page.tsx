"use client";

/**
 * Phases screen — the pipeline teams and participants move through.
 *
 * Order is what gives "next"/"previous" meaning everywhere else, so it is
 * edited here with explicit ↑/↓ swaps rather than free-text numbers.
 * Disabling a phase is derived (members are blocked, their own rows untouched),
 * and deleting is refused while anything still points at the phase.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Layers, Plus, ArrowUp, ArrowDown, Trash2, Pencil, Ban, CheckCircle2, Users, UserCheck, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../../components/ui/use-toast";

interface PhaseCounts {
  teams: number;
  teamsFailed: number;
  participants: number;
  participantsFailed: number;
}
interface Phase {
  id: string;
  name: string;
  order: number;
  description: string | null;
  isDisabled: boolean;
  disabledAt: string | null;
  counts: PhaseCounts;
}

export default function PhasesPage() {
  const { toast } = useToast();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Phase | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [deleting, setDeleting] = useState<Phase | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/phases", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر جلب المراحل");
      setPhases(data.phases || []);
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذر جلب المراحل", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const createPhase = async () => {
    if (!newName.trim()) {
      toast({ title: "الاسم مطلوب", description: "يرجى كتابة اسم المرحلة", variant: "warning" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء المرحلة");
      toast({ title: "تم إنشاء المرحلة", description: newName.trim(), variant: "success" });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      await load();
    } catch (error) {
      toast({ title: "لم يتم الإنشاء", description: error instanceof Error ? error.message : "خطأ", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const updatePhase = async (phase: Phase, body: Record<string, unknown>, successMessage: string) => {
    setBusyId(phase.id);
    try {
      const res = await fetch(`/api/admin/phases/${phase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر التحديث");
      toast({ title: successMessage, description: phase.name, variant: "success" });
      await load();
      return true;
    } catch (error) {
      toast({ title: "لم يتم التحديث", description: error instanceof Error ? error.message : "خطأ", variant: "destructive" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  /** Swap with the neighbour: the API handles the unique-order swap safely. */
  const move = (phase: Phase, direction: "up" | "down") => {
    const index = phases.findIndex((p) => p.id === phase.id);
    const neighbour = phases[direction === "up" ? index - 1 : index + 1];
    if (!neighbour) return;
    return updatePhase(phase, { order: neighbour.order }, "تم تغيير الترتيب");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      toast({ title: "الاسم مطلوب", variant: "warning" });
      return;
    }
    const ok = await updatePhase(editing, { name: editName.trim(), description: editDescription.trim() }, "تم حفظ التعديل");
    if (ok) setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      const res = await fetch(`/api/admin/phases/${deleting.id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر الحذف");
      toast({ title: "تم حذف المرحلة", description: deleting.name, variant: "success" });
      setDeleting(null);
      await load();
    } catch (error) {
      toast({ title: "لم يتم الحذف", description: error instanceof Error ? error.message : "خطأ", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const totals = phases.reduce(
    (acc, p) => ({
      teams: acc.teams + p.counts.teams,
      participants: acc.participants + p.counts.participants,
      failed: acc.failed + p.counts.teamsFailed + p.counts.participantsFailed,
    }),
    { teams: 0, participants: 0, failed: 0 }
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Layers className="h-6 w-6" />
            المراحل
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            المسار الذي تتنقل خلاله الفرق والمشاركون. الترتيب هنا هو ما يحدد &quot;التالية&quot; و&quot;السابقة&quot; في باقي الصفحات.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          مرحلة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{phases.length}</div>
              <div className="text-xs text-muted-foreground">مرحلة</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{totals.teams}</div>
              <div className="text-xs text-muted-foreground">فريق مُوزّع على المراحل</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{totals.failed}</div>
              <div className="text-xs text-muted-foreground">متعثّر</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ترتيب المراحل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">جاري التحميل…</div>
          ) : phases.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">لا توجد مراحل بعد.</p>
              <Button variant="outline" className="mt-3 gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                أضف أول مرحلة
              </Button>
            </div>
          ) : (
            phases.map((phase, index) => (
              <div
                key={phase.id}
                className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  phase.isDisabled ? "border-dashed bg-muted/40" : ""
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      disabled={index === 0 || busyId === phase.id}
                      onClick={() => move(phase, "up")}
                      aria-label="تحريك لأعلى"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      disabled={index === phases.length - 1 || busyId === phase.id}
                      onClick={() => move(phase, "down")}
                      aria-label="تحريك لأسفل"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{phase.name}</span>
                      {phase.isDisabled && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Ban className="h-3 w-3" />
                          معطّلة
                        </Badge>
                      )}
                    </div>
                    {phase.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{phase.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        {phase.counts.teams} فريق
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {phase.counts.participants} مشارك
                      </span>
                      {phase.counts.teamsFailed + phase.counts.participantsFailed > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="h-3 w-3" />
                          {phase.counts.teamsFailed + phase.counts.participantsFailed} متعثّر
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    disabled={busyId === phase.id}
                    onClick={() => { setEditing(phase); setEditName(phase.name); setEditDescription(phase.description || ""); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    disabled={busyId === phase.id}
                    onClick={() =>
                      updatePhase(phase, { isDisabled: !phase.isDisabled }, phase.isDisabled ? "تم تفعيل المرحلة" : "تم تعطيل المرحلة")
                    }
                  >
                    {phase.isDisabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    {phase.isDisabled ? "تفعيل" : "تعطيل"}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === phase.id}
                    onClick={() => setDeleting(phase)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </Button>
                </div>
              </div>
            ))
          )}

          {phases.length > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              نقل الفرق والمشاركين بين المراحل يتم من صفحتَي{" "}
              <Link href="/admin-hackton-dashboard/teams" className="underline underline-offset-2">الفرق</Link>{" و "}
              <Link href="/admin-hackton-dashboard/participants" className="underline underline-offset-2">المشاركين</Link>.
              تعطيل المرحلة يمنع أعضاءها من الدخول واستلام الرسائل دون تغيير حالة حساباتهم.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>مرحلة جديدة</DialogTitle>
            <DialogDescription>تُضاف في نهاية المسار، ويمكنك تغيير ترتيبها بعد الإنشاء.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="phase-name">اسم المرحلة</Label>
              <Input id="phase-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: التصفيات الأولية" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phase-desc">الوصف (اختياري)</Label>
              <Textarea id="phase-desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
            <Button onClick={createPhase} disabled={creating} className="w-full sm:w-auto">
              {creating ? "جاري الإنشاء…" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المرحلة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">اسم المرحلة</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">الوصف</Label>
              <Textarea id="edit-desc" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setEditing(null)} className="w-full sm:w-auto">إلغاء</Button>
            <Button onClick={saveEdit} disabled={busyId === editing?.id} className="w-full sm:w-auto">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف المرحلة</DialogTitle>
            <DialogDescription>
              سيتم حذف &quot;{deleting?.name}&quot;. لا يمكن الحذف إذا كانت مرتبطة بفرق أو مشاركين أو تسليمات.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDeleting(null)} className="w-full sm:w-auto">إلغاء</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busyId === deleting?.id} className="w-full sm:w-auto">
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
