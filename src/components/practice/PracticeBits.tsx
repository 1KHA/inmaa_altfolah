"use client";

import { CheckCircle2, Clock, FilePen, MessageSquareWarning, Circle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRACTICE_DECISION_LABELS, PRACTICE_MAX_SCORE, PRACTICE_STATUS_LABELS, type PracticeStatus } from "@/lib/practice-cards";

const STATUS_STYLE: Record<PracticeStatus, { className: string; icon: typeof Circle }> = {
  not_started: { className: "bg-gray-100 text-gray-500", icon: Circle },
  draft: { className: "bg-slate-100 text-slate-700", icon: FilePen },
  submitted: { className: "bg-blue-50 text-blue-700", icon: Clock },
  needs_revision: { className: "bg-amber-50 text-amber-800", icon: MessageSquareWarning },
  approved: { className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
};

export function PracticeStatusBadge({ status, className }: { status: PracticeStatus; className?: string }) {
  const { className: tone, icon: Icon } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tone, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {PRACTICE_STATUS_LABELS[status]}
    </span>
  );
}

export function ScoreStars({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score == null) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} title={`${score} من ${PRACTICE_MAX_SCORE}`}>
      {Array.from({ length: PRACTICE_MAX_SCORE }, (_, i) => (
        <Star key={i} aria-hidden className={cn("h-3.5 w-3.5", i < score ? "fill-amber-400 text-amber-400" : "text-gray-300")} />
      ))}
      <span className="sr-only">{`${score} من ${PRACTICE_MAX_SCORE}`}</span>
    </span>
  );
}

export interface PracticeReviewItem {
  id: string;
  decision: "approved" | "needs_revision";
  comment: string;
  reviewerName: string;
  reviewerType: "advisor" | "admin";
  createdAt: string;
  /** Present for reviewers only — participants never receive scores */
  score?: number;
}

export function formatPracticeDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Reviewers' comments on a card, newest first. */
export function PracticeReviewThread({ reviews, emptyText }: { reviews: PracticeReviewItem[]; emptyText?: string }) {
  if (reviews.length === 0) {
    return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null;
  }
  return (
    <ol className="space-y-3">
      {reviews.map((review) => {
        const needsRevision = review.decision === "needs_revision";
        return (
          <li
            key={review.id}
            className={cn(
              "rounded-lg border p-3",
              needsRevision ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn("font-semibold", needsRevision ? "text-amber-900" : "text-emerald-800")}>
                {PRACTICE_DECISION_LABELS[review.decision]}
              </span>
              <span className="text-muted-foreground">
                {review.reviewerName}
                {review.reviewerType === "advisor" ? " · مستشار" : ""}
              </span>
              {review.score != null && <ScoreStars score={review.score} />}
              <span className="ms-auto text-xs text-muted-foreground">{formatPracticeDate(review.createdAt)}</span>
            </div>
            {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-gray-800">{review.comment}</p>}
          </li>
        );
      })}
    </ol>
  );
}
