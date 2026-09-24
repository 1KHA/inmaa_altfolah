"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "../../../components/ui/use-toast";
import { CheckCheck, Loader2, Mail } from "lucide-react";

type Target = "teams" | "participants";

interface Progress {
  jobId: string;
  target: Target;
  requested: number;
  approved: number;
  skipped: number;
  failed: number;
  done: boolean;
  emails: { total: number; sent: number; failed: number; status: string; pending: number; sending: number };
}

interface Props {
  target: Target;
  /** Explicit selection; omit to accept every pending row. */
  ids?: string[];
  /** Called after the job finishes (or is closed) so the page can refresh. */
  onDone?: () => void;
  size?: "sm" | "default";
  variant?: "default" | "outline";
  className?: string;
}

const NOUN: Record<Target, { one: string; many: string }> = {
  teams: { one: "فريق", many: "الفرق" },
  participants: { one: "مشارك", many: "المشاركين الأفراد" },
};

/**
 * "Accept all / accept selected" with a two-phase progress dialog:
 *   1. approvals — POST /api/admin/bulk-approve in a loop until `done`
 *      (each call works ~8 s server-side; safe to interrupt and re-run);
 *   2. emails — the queued credential emails are pushed to completion via
 *      POST /api/admin/email-queue/drain while the dialog stays open, with
 *      the cron as the safety net if the admin closes it.
 */
export default function BulkApproveButton({ target, ids, onDone, size = "sm", variant = "default", className }: Props) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [phase, setPhase] = useState<"approving" | "emailing" | "finished">("approving");
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const noun = NOUN[target];

  // How many rows this action would really accept (selection may include
  // already-approved rows, which are skipped).
  useEffect(() => {
    if (!confirmOpen) return;
    setPendingCount(null);
    const q = new URLSearchParams({ target });
    if (ids) q.set("ids", ids.join(","));
    fetch(`/api/admin/bulk-approve?${q}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPendingCount(typeof d.pending === "number" ? d.pending : 0))
      .catch(() => setPendingCount(0));
  }, [confirmOpen, target, ids]);

  const post = async (body: Record<string, unknown>): Promise<Progress> => {
    const res = await fetch("/api/admin/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل تنفيذ القبول الجماعي");
    return data as Progress;
  };

  const refresh = async (jobId: string): Promise<Progress> => {
    const res = await fetch(`/api/admin/bulk-approve?jobId=${encodeURIComponent(jobId)}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "تعذر قراءة حالة المهمة");
    return data as Progress;
  };

  const run = async () => {
    cancelled.current = false;
    setError(null);
    setRunning(true);
    setPhase("approving");
    setConfirmOpen(false);
    try {
      // ---- phase 1: approvals, chunk by chunk --------------------------------
      let p = await post(ids ? { target, ids } : { target });
      setProgress(p);
      while (!p.done && !cancelled.current) {
        p = await post({ jobId: p.jobId });
        setProgress(p);
      }
      if (cancelled.current) return;

      // ---- phase 2: push the queued emails until nothing is left -------------
      // The server already started a background drain; this loop adds a
      // worker (safe: rows are claimed with SKIP LOCKED) and keeps the
      // progress fresh. Rows in `sending` belong to a live worker, so we keep
      // polling; only rows parked in `pending` with nothing moving (retry
      // backoff / email disabled) end the loop early — the cron finishes those.
      setPhase("emailing");
      let open = p.emails.pending + p.emails.sending;
      let idle = 0;
      while (open > 0 && !cancelled.current) {
        const before = p.emails.sent + p.emails.failed;
        const res = await fetch("/api/admin/email-queue/drain", { method: "POST", credentials: "include" });
        if (!res.ok) throw new Error("تعذر تشغيل إرسال البريد");
        const drain = await res.json();
        if (drain.stoppedBy === "email-disabled") {
          p = await refresh(p.jobId);
          setProgress(p);
          setError("البريد الإلكتروني معطّل في الإعدادات — تم القبول وستُرسل الرسائل تلقائياً عند تفعيله.");
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
        p = await refresh(p.jobId);
        setProgress(p);
        open = p.emails.pending + p.emails.sending;
        const moved = p.emails.sent + p.emails.failed !== before;
        idle = moved || p.emails.sending > 0 ? 0 : idle + 1;
        if (idle >= 4) {
          setError("بعض الرسائل بانتظار إعادة المحاولة؛ ستُرسل تلقائياً خلال الدقائق القادمة.");
          break;
        }
      }
      setPhase("finished");
      toast({
        title: "اكتمل القبول الجماعي",
        description: `تم قبول ${p.approved} ${noun.one} — بريد ناجح ${p.emails.sent}${p.emails.failed ? `، فاشل ${p.emails.failed}` : ""}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      setPhase("finished");
    } finally {
      setRunning(false);
    }
  };

  const close = () => {
    cancelled.current = true;
    setRunning(false);
    setProgress(null);
    onDone?.();
  };

  const approvalPct = progress && progress.requested > 0
    ? Math.min(100, Math.round(((progress.approved + progress.skipped + progress.failed) / progress.requested) * 100))
    : 0;
  const emailPct = progress && progress.emails.total > 0
    ? Math.min(100, Math.round(((progress.emails.sent + progress.emails.failed) / progress.emails.total) * 100))
    : 0;

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setConfirmOpen(true)} disabled={running}>
        <CheckCheck className="ml-1 h-4 w-4" />
        {ids ? "قبول المحدد" : `قبول جميع ${noun.many} المعلّقين`}
      </Button>

      {/* confirm */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !running && setConfirmOpen(v)}>
        <DialogContent dir="rtl" className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تأكيد القبول الجماعي</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {pendingCount === null
                  ? "جاري حساب العناصر المعلّقة..."
                  : pendingCount === 0
                  ? `لا يوجد ${noun.one} معلّق ضمن ${ids ? "التحديد" : "القائمة"}.`
                  : `سيتم قبول ${pendingCount} ${noun.one} معلّق${ids ? " من ضمن التحديد" : ""}.`}
              </span>
              <span className="block">
                يُنشأ لكل عضو حساب دخول وتُرسل بيانات الدخول بالبريد عبر قائمة الانتظار (رسالة لكل شخص)؛ لن يُغيَّر أي عنصر مقبول أو مرفوض مسبقاً.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
            <Button onClick={run} disabled={!pendingCount} className="w-full sm:w-auto">
              <CheckCheck className="ml-1 h-4 w-4" />
              بدء القبول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* progress */}
      <Dialog open={!!progress} onOpenChange={(v) => { if (!v && !running) close(); }}>
        <DialogContent dir="rtl" className="rounded-lg border-0 shadow-lg" onInteractOutside={(e) => running && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCheck className="h-5 w-5 text-green-600" />}
              {phase === "approving" ? "جاري القبول..." : phase === "emailing" ? "جاري إرسال بيانات الدخول..." : "اكتملت العملية"}
            </DialogTitle>
            <DialogDescription>
              يمكنك إبقاء هذه النافذة مفتوحة حتى يكتمل الإرسال؛ إغلاقها لا يوقف العملية — تُكمل الخلفية إرسال ما تبقى.
            </DialogDescription>
          </DialogHeader>
          {progress && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>القبول</span>
                  <span dir="ltr">{progress.approved + progress.skipped + progress.failed} / {progress.requested}</span>
                </div>
                <Progress value={approvalPct} className="h-2" />
                <div className="mt-1 text-xs text-muted-foreground">
                  مقبول {progress.approved}
                  {progress.skipped > 0 && ` · متجاوز (غير معلّق) ${progress.skipped}`}
                  {progress.failed > 0 && <span className="text-red-600"> · فشل {progress.failed}</span>}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> رسائل بيانات الدخول</span>
                  <span dir="ltr">{progress.emails.sent + progress.emails.failed} / {progress.emails.total}</span>
                </div>
                <Progress value={emailPct} className="h-2" />
                <div className="mt-1 text-xs text-muted-foreground">
                  ناجح {progress.emails.sent}
                  {progress.emails.failed > 0 && <span className="text-red-600"> · فاشل {progress.emails.failed} (يمكن إعادة المحاولة من صفحة الإشعارات → سجل الرسائل)</span>}
                </div>
              </div>
              {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md p-2">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant={running ? "outline" : "default"} onClick={close} className="w-full sm:w-auto">
              {running ? "إغلاق (تستمر العملية في الخلفية)" : "إغلاق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
