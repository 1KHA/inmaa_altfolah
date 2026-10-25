"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import PracticeCardView from "./PracticeCardView";
import { PracticeReviewThread, PracticeStatusBadge, ScoreStars, formatPracticeDate, type PracticeReviewItem } from "./PracticeBits";
import {
  PRACTICE_CARDS,
  PRACTICE_CARD_COUNT,
  PRACTICE_MAX_SCORE,
  isPracticeReviewable,
  type PracticeAnswers,
  type PracticeStatus,
} from "@/lib/practice-cards";

/*
 * One team's practice cards for a reviewer (admin or advisor): pick a card,
 * read the team's answers, then score it (1–5) and approve it or send it back
 * with comments. Used by /admin-hackton-dashboard/practice/[teamId] and
 * /advisor-dashboard/teams/[teamId].
 */

interface ReviewerCard {
  id: string;
  cardKey: string;
  status: PracticeStatus;
  answers: PracticeAnswers;
  score: number | null;
  submitCount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviews: (PracticeReviewItem & { score: number })[];
}

interface TeamData {
  team: { id: string; teamName: string; ideaDescription: string | null; members: { id: string; fullName: string; isLeader: boolean }[] };
  cards: Record<string, ReviewerCard>;
}

const CHIP_STYLE: Record<PracticeStatus, string> = {
  not_started: "border-gray-200 bg-white text-gray-400",
  draft: "border-slate-200 bg-slate-50 text-slate-500",
  submitted: "border-blue-300 bg-blue-50 text-blue-800",
  needs_revision: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export default function TeamPracticeReview({ teamId, basePath, backHref }: { teamId: string; basePath: string; backHref: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/practice/teams/${teamId}`, { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "تعذر تحميل نماذج الفريق");
        setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "تعذر تحميل نماذج الفريق"));
  }, [teamId]);

  // The card in the URL; otherwise the first one waiting for review, otherwise card 1
  const requested = searchParams.get("card");
  const selectedKey =
    (requested && PRACTICE_CARDS.some((c) => c.key === requested) && requested) ||
    PRACTICE_CARDS.find((c) => data?.cards[c.key]?.status === "submitted")?.key ||
    PRACTICE_CARDS[0].key;
  const card = PRACTICE_CARDS.find((c) => c.key === selectedKey)!;

  const select = (key: string) => router.replace(`${basePath}?card=${key}`, { scroll: false });
  const onReviewed = useCallback((updated: ReviewerCard) => {
    setData((d) => (d ? { ...d, cards: { ...d.cards, [updated.cardKey]: updated } } : d));
  }, []);

  if (error) return <Card className="p-6 text-center text-sm text-red-700" dir="rtl">{error}</Card>;
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const sub = data.cards[selectedKey];
  const status: PracticeStatus = sub?.status ?? "not_started";
  const scored = Object.values(data.cards).filter((c) => c.score != null);
  const total = scored.reduce((sum, c) => sum + (c.score ?? 0), 0);
  const approved = Object.values(data.cards).filter((c) => c.status === "approved").length;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-1 gap-1 px-2">
            <Link href={backHref}>
              <ArrowRight className="h-4 w-4" />
              كل الفرق
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">{data.team.teamName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.team.members.map((m) => (m.isLeader ? `${m.fullName} (القائد)` : m.fullName)).join("، ")}
          </p>
        </div>
        <div className="flex gap-3 text-center">
          <Card className="px-4 py-2">
            <p className="text-xs text-muted-foreground">مكتمل</p>
            <p className="text-lg font-bold">{approved} من {PRACTICE_CARD_COUNT}</p>
          </Card>
          <Card className="px-4 py-2">
            <p className="text-xs text-muted-foreground">مجموع التقييم</p>
            <p className="text-lg font-bold text-primary">{total} من {PRACTICE_CARD_COUNT * PRACTICE_MAX_SCORE}</p>
          </Card>
        </div>
      </div>

      {/* The 12 cards, coloured by status, with their current score */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
        {PRACTICE_CARDS.map((c) => {
          const s: PracticeStatus = data.cards[c.key]?.status ?? "not_started";
          const score = data.cards[c.key]?.score;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => select(c.key)}
              title={c.title}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 text-xs transition",
                CHIP_STYLE[s],
                c.key === selectedKey && "ring-2 ring-primary ring-offset-1"
              )}
            >
              <span className="text-base font-bold">{c.number}</span>
              <span className="line-clamp-1">{score != null ? `${score}/${PRACTICE_MAX_SCORE}` : "—"}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PracticeStatusBadge status={status} />
        {sub?.score != null && <ScoreStars score={sub.score} />}
        {sub?.submittedAt && status !== "draft" && (
          <span className="text-xs text-muted-foreground">
            أُرسل {formatPracticeDate(sub.submittedAt)}
            {sub.submitCount > 1 ? ` (المرة ${sub.submitCount})` : ""}
          </span>
        )}
      </div>

      {status === "not_started" || status === "draft" ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {status === "draft" ? "يعمل الفريق على مسودة لهذا النموذج ولم يرسلها بعد." : "لم يبدأ الفريق هذا النموذج بعد."}
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
          <PracticeCardView card={card} answers={sub.answers} />
          <div className="space-y-4">
            {isPracticeReviewable(status) ? (
              <ReviewForm key={sub.id} submission={sub} onReviewed={onReviewed} />
            ) : (
              <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                أُعيد النموذج للفريق للتعديل. ستتمكن من مراجعته مرة أخرى بعد أن يعيد الفريق إرساله.
              </Card>
            )}
            <div className="space-y-2">
              <h2 className="font-bold">سجل المراجعات</h2>
              <PracticeReviewThread reviews={sub.reviews} emptyText="لم يُراجَع هذا النموذج بعد." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewForm({ submission, onReviewed }: { submission: ReviewerCard; onReviewed: (card: ReviewerCard) => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approved" | "needs_revision" | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ready = score != null && decision != null && (decision === "approved" || comment.trim().length > 0);

  const send = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice/submissions/${submission.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, score, comment }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "تعذر حفظ المراجعة");
      setDone(decision === "approved" ? "تم اعتماد النموذج وإشعار الفريق." : "أُعيد النموذج للفريق مع ملاحظاتك، وأُرسل لهم إشعار.");
      setScore(null);
      setDecision(null);
      setComment("");
      onReviewed(json.card);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ المراجعة");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <h2 className="font-bold">{submission.status === "approved" ? "تعديل المراجعة" : "مراجعة النموذج"}</h2>
      {done && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}

      <div>
        <p className="mb-2 text-sm font-medium">التقييم</p>
        <div className="flex gap-1" role="radiogroup" aria-label="التقييم">
          {Array.from({ length: PRACTICE_MAX_SCORE }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} من ${PRACTICE_MAX_SCORE}`}
              onClick={() => setScore(n)}
              className="rounded p-1 transition hover:scale-110"
            >
              <Star className={cn("h-7 w-7", score != null && n <= score ? "fill-amber-400 text-amber-400" : "text-gray-300")} />
            </button>
          ))}
          {score != null && <span className="self-center ps-2 text-sm text-muted-foreground">{score} من {PRACTICE_MAX_SCORE}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDecision("approved")}
          className={cn(
            "flex items-center justify-center gap-1 rounded-lg border-2 px-2 py-2 text-sm font-medium transition",
            decision === "approved" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 hover:border-gray-300"
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          اعتماد
        </button>
        <button
          type="button"
          onClick={() => setDecision("needs_revision")}
          className={cn(
            "flex items-center justify-center gap-1 rounded-lg border-2 px-2 py-2 text-sm font-medium transition",
            decision === "needs_revision" ? "border-amber-500 bg-amber-50 text-amber-900" : "border-gray-200 hover:border-gray-300"
          )}
        >
          <RotateCcw className="h-4 w-4" />
          إعادة للتعديل
        </button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">
          ملاحظات للفريق {decision === "needs_revision" ? <span className="text-red-600">*</span> : <span className="text-muted-foreground">(اختياري)</span>}
        </p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={5}
          placeholder={decision === "needs_revision" ? "ما الذي يحتاج الفريق إلى تعديله؟" : "ملاحظات تساعد الفريق على التحسين"}
        />
        <p className="mt-1 text-xs text-muted-foreground">يرى الفريق ملاحظاتك، ولا يرى التقييم.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button className="w-full" disabled={!ready || saving} onClick={send}>
        {saving && <Loader2 className="me-1 h-4 w-4 animate-spin" />}
        إرسال المراجعة
      </Button>
    </Card>
  );
}
