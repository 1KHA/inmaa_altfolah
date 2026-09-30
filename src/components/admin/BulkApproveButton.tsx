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
import { CheckCheck, Loader2, Mail, UserX } from "lucide-react";

type Target = "teams" | "participants";
type Action = "approve" | "reject";

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
  /** What the job does. Defaults to acceptance. */
  action?: Action;
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

/** Every string that differs between the two actions, in one place. */
const COPY: Record<Action, {
  buttonSelected: string;
  buttonAll: (many: string) => string;
  dialogTitle: string;
  summary: (n: number, one: string, scoped: boolean) => string;
  note: string;
  start: string;
  phase: string;
  progressLabel: string;
  doneLabel: string;
  mailLabel: string;
  toastTitle: string;
  toastDone: (n: number, one: string) => string;
  postError: string;
  emailDisabled: string;
  destructive: boolean;
}> = {
  approve: {
    buttonSelected: "قبول المحدد",
    buttonAll: (many) => `قبول جميع ${many} المعلّقين`,
    dialogTitle: "تأكيد القبول الجماعي",
    summary: (n, one, scoped) => `سيتم قبول ${n} ${one} معلّق${scoped ? " من ضمن التحديد" : ""}.`,
    note: "يُنشأ لكل عضو حساب دخول وتُرسل بيانات الدخول بالبريد عبر قائمة الانتظار (رسالة لكل شخص)؛ لن يُغيَّر أي عنصر مقبول أو مرفوض مسبقاً.",
    start: "بدء القبول",
    phase: "جاري القبول...",
    progressLabel: "القبول",
    doneLabel: "مقبول",
    mailLabel: "رسائل بيانات الدخول",
    toastTitle: "اكتمل القبول الجماعي",
    toastDone: (n, one) => `تم قبول ${n} ${one}`,
    postError: "فشل تنفيذ القبول الجماعي",
    emailDisabled: "البريد الإلكتروني معطّل في الإعدادات — تم القبول وستُرسل الرسائل تلقائياً عند تفعيله.",
    destructive: false,
  },
  reject: {
    buttonSelected: "رفض المحدد",
    buttonAll: (many) => `رفض جميع ${many} المعلّقين`,
    dialogTitle: "تأكيد الرفض الجماعي",
    summary: (n, one, scoped) => `سيتم رفض ${n} ${one} معلّق${scoped ? " من ضمن التحديد" : ""}.`,
    note: "تُرسل رسالة اعتذار لكل مستلم عبر قائمة الانتظار، ولا تُنشأ حسابات دخول؛ لن يُغيَّر أي عنصر مقبول أو مرفوض مسبقاً. لا يمكن التراجع عن الرفض من هذه الشاشة.",
    start: "بدء الرفض",
    phase: "جاري الرفض...",
    progressLabel: "الرفض",
    doneLabel: "مرفوض",
    mailLabel: "رسائل الاعتذار",
    toastTitle: "اكتمل الرفض الجماعي",
    toastDone: (n, one) => `تم رفض ${n} ${one}`,
    postError: "فشل تنفيذ الرفض الجماعي",
    emailDisabled: "البريد الإلكتروني معطّل في الإعدادات — تم الرفض وستُرسل الرسائل تلقائياً عند تفعيله.",
    destructive: true,
  },
};

/**
 * "Accept all / accept selected" with a two-phase progress dialog:
 *   1. approvals — POST /api/admin/bulk-approve in a loop until `done`
 *      (each call works ~8 s server-side; safe to interrupt and re-run);
 *   2. emails — the queued credential emails are pushed to completion via
 *      POST /api/admin/email-queue/drain while the dialog stays open, with
 *      the cron as the safety net if the admin closes it.
 */
export default function BulkApproveButton({ target, action = "approve", ids, onDone, size = "sm", variant = "default", className }: Props) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [phase, setPhase] = useState<"approving" | "emailing" | "finished">("approving");
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const noun = NOUN[target];
  const copy = COPY[action];
  const ActionIcon = copy.destructive ? UserX : CheckCheck;

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
    if (!res.ok) throw new Error(data.error || copy.postError);
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
      let p = await post(ids ? { target, action, ids } : { target, action });
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
          setError(copy.emailDisabled);
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
        title: copy.toastTitle,
        description: `${copy.toastDone(p.approved, noun.one)} — بريد ناجح ${p.emails.sent}${p.emails.failed ? `، فاشل ${p.emails.failed}` : ""}`,
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
      <Button
        size={size}
        variant={copy.destructive && variant === "default" ? "destructive" : variant}
        className={className}
        onClick={() => setConfirmOpen(true)}
        disabled={running}
      >
        <ActionIcon className="ml-1 h-4 w-4" />
        {ids ? copy.buttonSelected : copy.buttonAll(noun.many)}
      </Button>

      {/* confirm */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !running && setConfirmOpen(v)}>
        <DialogContent dir="rtl" className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>{copy.dialogTitle}</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {pendingCount === null
                  ? "جاري حساب العناصر المعلّقة..."
                  : pendingCount === 0
                  ? `لا يوجد ${noun.one} معلّق ضمن ${ids ? "التحديد" : "القائمة"}.`
                  : copy.summary(pendingCount, noun.one, !!ids)}
              </span>
              <span className="block">{copy.note}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
            <Button
              onClick={run}
              disabled={!pendingCount}
              variant={copy.destructive ? "destructive" : "default"}
              className="w-full sm:w-auto"
            >
              <ActionIcon className="ml-1 h-4 w-4" />
              {copy.start}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* progress */}
      <Dialog open={!!progress} onOpenChange={(v) => { if (!v && !running) close(); }}>
        <DialogContent dir="rtl" className="rounded-lg border-0 shadow-lg" onInteractOutside={(e) => running && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <ActionIcon className={`h-5 w-5 ${copy.destructive ? "text-red-600" : "text-green-600"}`} />}
              {phase === "approving" ? copy.phase : phase === "emailing" ? "جاري إرسال الرسائل..." : "اكتملت العملية"}
            </DialogTitle>
            <DialogDescription>
              يمكنك إبقاء هذه النافذة مفتوحة حتى يكتمل الإرسال؛ إغلاقها لا يوقف العملية — تُكمل الخلفية إرسال ما تبقى.
            </DialogDescription>
          </DialogHeader>
          {progress && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>{copy.progressLabel}</span>
                  <span dir="ltr">{progress.approved + progress.skipped + progress.failed} / {progress.requested}</span>
                </div>
                <Progress value={approvalPct} className="h-2" />
                <div className="mt-1 text-xs text-muted-foreground">
                  {copy.doneLabel} {progress.approved}
                  {progress.skipped > 0 && ` · متجاوز (غير معلّق) ${progress.skipped}`}
                  {progress.failed > 0 && <span className="text-red-600"> · فشل {progress.failed}</span>}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> {copy.mailLabel}</span>
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
