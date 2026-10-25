"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Info, Loader2, Lock, MessageSquareWarning, Save, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/contexts/sidebar-context";
import PracticeCardView from "@/components/practice/PracticeCardView";
import { PracticeReviewThread, PracticeStatusBadge, formatPracticeDate, type PracticeReviewItem } from "@/components/practice/PracticeBits";
import {
  PRACTICE_CARDS,
  PRACTICE_CARD_COUNT,
  getPracticeCard,
  isPracticeEditable,
  type PracticeAnswers,
  type PracticeStatus,
} from "@/lib/practice-cards";

/*
 * «النماذج»: the 12 practice cards. The team leader fills each card in and
 * sends it for review, one by one and in any order; the other members read
 * the same cards and the reviewers' comments. Scores are never shown here.
 */

interface TeamCard {
  cardKey: string;
  status: PracticeStatus;
  answers: PracticeAnswers;
  submitCount: number;
  submittedAt: string | null;
  updatedAt: string;
  reviews: PracticeReviewItem[];
}

interface PracticeData {
  teamName: string;
  isLeader: boolean;
  cards: Record<string, TeamCard>;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 1500;

export default function PracticePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("card");
  const card = selectedKey ? getPracticeCard(selectedKey) : undefined;

  const [data, setData] = useState<PracticeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/participant/practice", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "تعذر تحميل النماذج");
      setData(json);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذر تحميل النماذج");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCard = (key: string | null) => {
    router.push(key ? `/participant-dashboard/practice?card=${key}` : "/participant-dashboard/practice");
    window.scrollTo({ top: 0 });
  };

  if (loadError) {
    return (
      <Card className="mx-auto mt-8 max-w-xl p-6 text-center text-sm text-red-700" dir="rtl">
        {loadError}
      </Card>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return card ? (
    <CardEditor
      key={card.key}
      cardKey={card.key}
      data={data}
      onSaved={(saved) => setData((d) => (d ? { ...d, cards: { ...d.cards, [saved.cardKey]: saved } } : d))}
      onNavigate={openCard}
    />
  ) : (
    <CardsGrid data={data} onOpen={openCard} />
  );
}

function CardsGrid({ data, onOpen }: { data: PracticeData; onOpen: (key: string) => void }) {
  const counts = useMemo(() => {
    const c = { approved: 0, submitted: 0, needs_revision: 0, draft: 0 };
    for (const tc of Object.values(data.cards)) if (tc.status in c) c[tc.status as keyof typeof c] += 1;
    return c;
  }, [data.cards]);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary md:text-3xl">النماذج</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {PRACTICE_CARD_COUNT} نموذجًا لمسار فهم التحدي وتطوير الحل واختباره. املؤوها بأي ترتيب وأرسلوا كل نموذج للمراجعة حين يكتمل.
        </p>
      </div>

      <Card className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-semibold text-primary">{data.teamName}</span>
          <span>مكتمل: <strong>{counts.approved}</strong> من {PRACTICE_CARD_COUNT}</span>
          <span>بانتظار المراجعة: <strong>{counts.submitted}</strong></span>
          <span className={counts.needs_revision ? "font-semibold text-amber-700" : undefined}>
            مطلوب تعديل: <strong>{counts.needs_revision}</strong>
          </span>
        </div>
        <Progress value={(counts.approved / PRACTICE_CARD_COUNT) * 100} className="h-2" />
        {!data.isLeader && (
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            يعبّئ قائد الفريق النماذج ويرسلها. يمكنك هنا الاطلاع على ما كتبه وعلى ملاحظات المراجعين.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRACTICE_CARDS.map((c) => {
          const tc = data.cards[c.key];
          const status: PracticeStatus = tc?.status ?? "not_started";
          const latest = tc?.reviews[0];
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onOpen(c.key)}
              className={`group flex h-full flex-col rounded-xl border bg-card p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                status === "needs_revision" ? "border-amber-300 ring-2 ring-amber-200" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-11 shrink-0 items-center justify-center rounded-lg bg-[#6E155E] text-lg font-bold text-white">
                  {c.number}
                </span>
                <div className="min-w-0">
                  <p className="font-bold leading-6 text-[#6E155E]">{c.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.subtitle}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <PracticeStatusBadge status={status} />
                {status === "needs_revision" && latest ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                    <MessageSquareWarning className="h-3.5 w-3.5" />
                    ملاحظات المراجع
                  </span>
                ) : tc?.updatedAt ? (
                  <span className="text-xs text-muted-foreground">{formatPracticeDate(tc.updatedAt)}</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CardEditor({
  cardKey,
  data,
  onSaved,
  onNavigate,
}: {
  cardKey: string;
  data: PracticeData;
  onSaved: (card: TeamCard) => void;
  onNavigate: (key: string | null) => void;
}) {
  const card = getPracticeCard(cardKey)!;
  const { isCollapsed } = useSidebar();
  const saved = data.cards[cardKey];
  const status: PracticeStatus = saved?.status ?? "not_started";
  const canEdit = data.isLeader && isPracticeEditable(status);

  const [answers, setAnswers] = useState<PracticeAnswers>(saved?.answers ?? {});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Saves run one after another, so a submit never races an autosave
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latestAnswers = useRef(answers);
  latestAnswers.current = answers;
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const save = useCallback(
    (submit: boolean) => {
      const run = async () => {
        setSaveState("saving");
        try {
          const res = await fetch(`/api/participant/practice/${cardKey}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: latestAnswers.current, submit }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            setSaveState("error");
            setError(json?.error || "تعذر حفظ النموذج");
            return false;
          }
          setError(null);
          setSaveState("saved");
          onSaved(json.card);
          return true;
        } catch {
          setSaveState("error");
          setError("تعذر الاتصال بالخادم، تحقق من اتصالك ثم احفظ مرة أخرى");
          return false;
        }
      };
      const next = queue.current.then(run, run);
      queue.current = next;
      return next;
    },
    [cardKey, onSaved]
  );

  const onChange = (key: string, value: string) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      save(false);
    }, AUTOSAVE_MS);
  };

  // Flush a pending autosave when leaving the card
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (canEdit) save(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const submit = async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setSubmitting(true);
    const ok = await save(true);
    setSubmitting(false);
    if (ok) setConfirmOpen(false);
  };

  const index = PRACTICE_CARDS.findIndex((c) => c.key === cardKey);
  const prev = PRACTICE_CARDS[index - 1];
  const next = PRACTICE_CARDS[index + 1];
  const latestReview = saved?.reviews[0];
  const hasAnswers = Object.values(answers).some((v) => v.trim());

  return (
    <div dir="rtl" className={`mx-auto max-w-6xl space-y-4 ${canEdit ? "pb-24" : "pb-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => onNavigate(null)}>
          <ArrowRight className="h-4 w-4" />
          كل النماذج
        </Button>
        <div className="flex items-center gap-2">
          <PracticeStatusBadge status={status} />
          {saved?.submittedAt && status !== "draft" && (
            <span className="text-xs text-muted-foreground">أُرسل {formatPracticeDate(saved.submittedAt)}</span>
          )}
        </div>
      </div>

      {/* What the visitor can do with this card right now */}
      {!data.isLeader ? (
        <Notice icon={Info}>يعرض هذا النموذج ما كتبه قائد الفريق. التعبئة والإرسال لقائد الفريق فقط.</Notice>
      ) : status === "submitted" ? (
        <Notice icon={Lock}>أرسلتم النموذج للمراجعة، ولا يمكن تعديله حتى تصل ملاحظات المراجع.</Notice>
      ) : status === "approved" ? (
        <Notice icon={Lock} tone="success">تم اعتماد هذا النموذج.</Notice>
      ) : null}
      {status === "needs_revision" && latestReview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <MessageSquareWarning className="h-4 w-4" />
            أعاد {latestReview.reviewerName} هذا النموذج للتعديل
          </p>
          <p className="mt-2 whitespace-pre-wrap leading-7 text-amber-950">{latestReview.comment}</p>
          {data.isLeader && <p className="mt-2 text-xs text-amber-800">عدّلوا النموذج ثم أرسلوه للمراجعة من جديد.</p>}
        </div>
      )}

      <PracticeCardView card={card} answers={canEdit ? answers : saved?.answers ?? {}} editable={canEdit} onChange={onChange} />

      {canEdit && (
        // Fixed, not sticky: the dashboard layout's overflow-x-hidden breaks sticky.
        // Starts after the sidebar (on the right in RTL), whatever its width.
        <div
          className={`fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur ${
            isCollapsed ? "md:start-16" : "md:start-64"
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              {error ? (
                <span className="text-red-600">{error}</span>
              ) : saveState === "saving" ? (
                "جارٍ الحفظ…"
              ) : saveState === "dirty" ? (
                "تغييرات غير محفوظة"
              ) : saveState === "saved" ? (
                "تم حفظ المسودة"
              ) : (
                "يُحفظ ما تكتبه تلقائيًا كمسودة لا يراها المراجعون حتى ترسلوها"
              )}
            </span>
            <Button variant="outline" size="sm" className="gap-1" disabled={saveState === "saving"} onClick={() => save(false)}>
              <Save className="h-4 w-4" />
              حفظ المسودة
            </Button>
            <Button size="sm" className="gap-1" disabled={!hasAnswers || submitting} onClick={() => setConfirmOpen(true)}>
              <Send className="h-4 w-4" />
              {status === "needs_revision" ? "إعادة الإرسال للمراجعة" : "إرسال للمراجعة"}
            </Button>
          </div>
        </div>
      )}


      <section className="space-y-3">
        <h2 className="text-lg font-bold text-primary">ملاحظات المراجعين</h2>
        <PracticeReviewThread reviews={saved?.reviews ?? []} emptyText="لا توجد ملاحظات على هذا النموذج بعد." />
      </section>

      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <Button variant="outline" size="sm" className="min-w-0 max-w-[48%] gap-1" onClick={() => onNavigate(prev.key)}>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="truncate">{prev.number}. {prev.title}</span>
          </Button>
        ) : <span />}
        {next ? (
          <Button variant="outline" size="sm" className="min-w-0 max-w-[48%] gap-1" onClick={() => onNavigate(next.key)}>
            <span className="truncate">{next.number}. {next.title}</span>
            <ChevronLeft className="h-4 w-4 shrink-0" />
          </Button>
        ) : <span />}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>إرسال «{card.title}» للمراجعة؟</DialogTitle>
            <DialogDescription>
              بعد الإرسال يُقفل النموذج حتى يراجعه المستشار. إن أعاده إليكم بملاحظات يمكنكم تعديله وإرساله من جديد.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={submit} disabled={submitting} className="gap-1">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Notice({ icon: Icon, tone, children }: { icon: typeof Info; tone?: "success"; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}
