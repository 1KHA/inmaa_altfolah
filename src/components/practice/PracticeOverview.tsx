"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PRACTICE_CARD_COUNT, PRACTICE_MAX_SCORE, PRACTICE_STATUS_LABELS, type PracticeStatus } from "@/lib/practice-cards";
import { formatPracticeDate } from "./PracticeBits";

/*
 * Reviewer home for the practice cards (admins and advisors): the queue of
 * cards waiting for review, and every accepted team with each card's status
 * and score. With `showRanking` (admins) teams are ranked by total score.
 */

interface OverviewTeam {
  id: string;
  teamName: string;
  isDisabled: boolean;
  membersCount: number;
  cards: Record<string, { status: PracticeStatus; score: number | null }>;
  totalScore: number;
  scoredCount: number;
  approvedCount: number;
  submittedCount: number;
  pendingCount: number;
}

interface Overview {
  cards: { key: string; number: number; title: string }[];
  teams: OverviewTeam[];
  queue: {
    submissionId: string;
    teamId: string;
    teamName: string;
    cardKey: string;
    cardNumber: number;
    cardTitle: string;
    submitCount: number;
    submittedAt: string | null;
  }[];
}

type SortKey = "score" | "approved" | "pending" | "name";

const CELL_STYLE: Record<PracticeStatus, string> = {
  not_started: "bg-gray-100 text-gray-300",
  draft: "bg-slate-200 text-slate-500",
  submitted: "bg-blue-100 text-blue-800",
  needs_revision: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
};

export default function PracticeOverview({
  teamHref,
  showRanking,
}: {
  teamHref: (teamId: string, cardKey?: string) => string;
  showRanking: boolean;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "teams">("queue");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(showRanking ? "score" : "pending");

  useEffect(() => {
    fetch("/api/practice/overview", { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "تعذر تحميل النماذج");
        setData(json);
        if (json.queue.length === 0) setTab("teams");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "تعذر تحميل النماذج"));
  }, []);

  const teams = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.teams.filter((t) => !q || t.teamName.toLowerCase().includes(q));
    const byName = (a: OverviewTeam, b: OverviewTeam) => a.teamName.localeCompare(b.teamName, "ar");
    const sorters: Record<SortKey, (a: OverviewTeam, b: OverviewTeam) => number> = {
      score: (a, b) => b.totalScore - a.totalScore || b.approvedCount - a.approvedCount || byName(a, b),
      approved: (a, b) => b.approvedCount - a.approvedCount || b.totalScore - a.totalScore || byName(a, b),
      pending: (a, b) => b.pendingCount - a.pendingCount || b.submittedCount - a.submittedCount || byName(a, b),
      name: byName,
    };
    return [...list].sort(sorters[sort]);
  }, [data, query, sort]);

  // Ranks follow the total score regardless of the current sort
  const rankOf = useMemo(() => {
    const ranks = new Map<string, number>();
    if (!data) return ranks;
    [...data.teams]
      .sort((a, b) => b.totalScore - a.totalScore || b.approvedCount - a.approvedCount)
      .forEach((t, i) => ranks.set(t.id, i + 1));
    return ranks;
  }, [data]);

  if (error) return <Card className="p-6 text-center text-sm text-red-700">{error}</Card>;
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totals = data.teams.reduce(
    (acc, t) => ({ submitted: acc.submitted + t.submittedCount, approved: acc.approved + t.approvedCount, active: acc.active + (t.submittedCount > 0 ? 1 : 0) }),
    { submitted: 0, approved: 0, active: 0 }
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardList className="h-6 w-6" />
          النماذج
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نماذج المختبرات ({PRACTICE_CARD_COUNT} نموذجًا) التي ترسلها الفرق للمراجعة. قيّم كل نموذج من 1 إلى {PRACTICE_MAX_SCORE}، واعتمده أو أعده للفريق بملاحظاتك.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="بانتظار المراجعة" value={data.queue.length} highlight={data.queue.length > 0} />
        <Stat label="فرق بدأت الإرسال" value={`${totals.active} من ${data.teams.length}`} />
        <Stat label="نماذج مرسلة" value={totals.submitted} />
        <Stat label="نماذج معتمدة" value={totals.approved} />
      </div>

      <div className="flex gap-2 border-b">
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          بانتظار المراجعة ({data.queue.length})
        </TabButton>
        <TabButton active={tab === "teams"} onClick={() => setTab("teams")}>
          {showRanking ? "ترتيب الفرق" : "الفرق"} ({data.teams.length})
        </TabButton>
      </div>

      {tab === "queue" ? (
        data.queue.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">لا توجد نماذج بانتظار المراجعة الآن.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">النموذج</th>
                  <th className="px-4 py-3 text-right font-medium">الفريق</th>
                  <th className="px-4 py-3 text-right font-medium">أُرسل</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.queue.map((item) => (
                  <tr key={item.submissionId} className="border-t">
                    <td className="px-4 py-3">
                      <span className="me-2 inline-flex h-6 w-7 items-center justify-center rounded bg-[#6E155E] text-xs font-bold text-white">
                        {item.cardNumber}
                      </span>
                      {item.cardTitle}
                    </td>
                    <td className="px-4 py-3 font-medium">{item.teamName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPracticeDate(item.submittedAt)}
                      {item.submitCount > 1 && (
                        <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">إعادة إرسال ×{item.submitCount - 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <Button asChild size="sm">
                        <Link href={teamHref(item.teamId, item.cardKey)}>مراجعة</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الفريق" className="ps-9" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              الترتيب حسب
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                {showRanking && <option value="score">مجموع التقييم</option>}
                <option value="approved">النماذج المكتملة</option>
                <option value="pending">بانتظار المراجعة</option>
                <option value="name">اسم الفريق</option>
              </select>
            </label>
            <Legend />
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {showRanking && <th className="px-3 py-3 text-right font-medium">#</th>}
                  <th className="px-3 py-3 text-right font-medium">الفريق</th>
                  {data.cards.map((c) => (
                    <th key={c.key} className="px-1 py-3 text-center font-medium" title={c.title}>
                      {c.number}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-medium">مكتمل</th>
                  <th className="px-3 py-3 text-center font-medium">مرسل</th>
                  {showRanking && (
                    <th className="px-3 py-3 text-center font-medium">
                      المجموع
                      <span className="block text-[10px] font-normal">من {PRACTICE_CARD_COUNT * PRACTICE_MAX_SCORE}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id} className={cn("border-t", team.isDisabled && "opacity-50")}>
                    {showRanking && <td className="px-3 py-2 text-muted-foreground">{rankOf.get(team.id)}</td>}
                    <td className="px-3 py-2">
                      <Link href={teamHref(team.id)} className="font-medium text-primary hover:underline">
                        {team.teamName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{team.membersCount} أعضاء</span>
                    </td>
                    {data.cards.map((c) => {
                      const cell = team.cards[c.key];
                      const status: PracticeStatus = cell?.status ?? "not_started";
                      return (
                        <td key={c.key} className="px-1 py-2 text-center">
                          <Link
                            href={teamHref(team.id, c.key)}
                            title={`${c.number}. ${c.title} — ${PRACTICE_STATUS_LABELS[status]}${cell?.score != null ? ` — ${cell.score}/${PRACTICE_MAX_SCORE}` : ""}`}
                            className={cn("mx-auto flex h-7 w-7 items-center justify-center rounded text-xs font-bold", CELL_STYLE[status])}
                          >
                            {cell?.score ?? (status === "submitted" ? "•" : "")}
                          </Link>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-medium">{team.approvedCount}</td>
                    <td className="px-3 py-2 text-center">{team.submittedCount}</td>
                    {showRanking && <td className="px-3 py-2 text-center text-base font-bold text-primary">{team.totalScore}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <Card className={cn("p-4", highlight && "border-blue-200 bg-blue-50")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Legend() {
  const items: PracticeStatus[] = ["submitted", "needs_revision", "approved", "draft"];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className={cn("inline-block h-3 w-3 rounded", CELL_STYLE[s])} />
          {PRACTICE_STATUS_LABELS[s]}
        </span>
      ))}
      <span>الرقم داخل المربع: التقييم</span>
    </div>
  );
}
