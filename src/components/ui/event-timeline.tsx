"use client";

/**
 * Hackathon journey timeline shown in every dashboard header.
 *
 * Dates mirror the "رحلة المشارك" section of the home page
 * (src/app/_childhood-landing/components/JourneySection.tsx) — keep the two in sync,
 * except "الإرشاد والتوجيه", which is deliberately left out of the dashboards.
 * Exactly one event "shines" at a time: the first one whose end date has not
 * passed yet (an event keeps glowing until the END of its last day, Riyadh
 * time, then the next one takes over). Everything else is dimmed — finished
 * events slightly brighter than upcoming ones.
 *
 * Variants:
 *  - "bar"  — horizontal, for the header center on md+ screens
 *  - "chip" — the active event only, for narrow (mobile) header centers
 *  - "list" — vertical, for mobile drawers/menus (replaces the old search box)
 *
 * All colors assume the dashboard header background.
 */

import { useEffect, useState } from "react";

export interface TimelineEvent {
  /** Full name (tooltip) */
  name: string;
  /** Short label rendered in the bar */
  shortName: string;
  /** Human date range as printed in the PDF */
  dateLabel: string;
  /** First day, YYYY-MM-DD */
  start: string;
  /** Last day, YYYY-MM-DD — shines until the end of this day */
  end: string;
}

export const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    shortName: "التسجيل وتكوين الفرق",
    name: "التسجيل وتكوين الفرق (إلكتروني)",
    dateLabel: "4 - 23 أكتوبر",
    start: "2026-10-04",
    end: "2026-10-23",
  },
  {
    shortName: "القبول",
    name: "القبول (إلكتروني)",
    dateLabel: "24 أكتوبر",
    start: "2026-10-24",
    end: "2026-10-24",
  },
  {
    shortName: "ورش العمل",
    name: "ورش العمل (حضوري · مختبر الابتكار بالخبر)",
    dateLabel: "8 - 11 نوفمبر",
    start: "2026-11-08",
    end: "2026-11-11",
  },
  {
    shortName: "العرض النهائي",
    name: "العرض النهائي (حضوري · مدينة الخبر)",
    dateLabel: "19 نوفمبر",
    start: "2026-11-19",
    end: "2026-11-19",
  },
];

/** End of a YYYY-MM-DD day in Riyadh time (UTC+3). */
const endOfDay = (day: string) => new Date(`${day}T23:59:59.999+03:00`).getTime();

/** Index of the shining event; -1 when the whole journey is over. */
export function activeTimelineIndex(now: number = Date.now()): number {
  return TIMELINE_EVENTS.findIndex((e) => endOfDay(e.end) >= now);
}

type Status = "past" | "active" | "future";

function statusOf(index: number, activeIdx: number): Status {
  if (activeIdx === -1) return "past"; // journey finished — everything dimmed
  if (index < activeIdx) return "past";
  if (index === activeIdx) return "active";
  return "future";
}

/** Re-render every minute so the glow hands over at midnight without a reload. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const DOT: Record<Status, string> = {
  active:
    "bg-brand-honey shadow-[0_0_10px_3px_hsl(var(--brand-honey)/0.85)] animate-pulse",
  past: "bg-primary-foreground/40",
  future: "bg-primary-foreground/15",
};

const NAME: Record<Status, string> = {
  active: "text-primary-foreground font-bold drop-shadow-[0_0_6px_hsl(var(--brand-honey)/0.8)]",
  past: "text-primary-foreground/45",
  future: "text-primary-foreground/30",
};

const DATE: Record<Status, string> = {
  active: "text-brand-honey",
  past: "text-primary-foreground/35",
  future: "text-primary-foreground/25",
};

export default function EventTimeline({
  variant = "bar",
  className = "",
}: {
  variant?: "bar" | "chip" | "list";
  className?: string;
}) {
  const now = useNow();
  const activeIdx = activeTimelineIndex(now);

  if (variant === "chip") {
    const current = activeIdx === -1 ? null : TIMELINE_EVENTS[activeIdx];
    return (
      <div
        dir="rtl"
        className={`flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-2.5 py-1 min-w-0 ${className}`}
        title={current ? `${current.name} — ${current.dateLabel}` : undefined}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${current ? DOT.active : DOT.past}`} />
        <span className="truncate text-[11px] font-medium text-primary-foreground">
          {current ? `${current.shortName} • ${current.dateLabel}` : "اكتملت جميع المراحل"}
        </span>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div dir="rtl" className={`space-y-1 ${className}`}>
        {TIMELINE_EVENTS.map((e, i) => {
          const st = statusOf(i, activeIdx);
          return (
            <div
              key={e.shortName}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                st === "active" ? "bg-primary-foreground/10" : ""
              }`}
              title={e.name}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[st]}`} />
              <span className={`flex-1 truncate text-xs ${NAME[st]}`}>{e.shortName}</span>
              <span className={`shrink-0 text-[10px] ${DATE[st]}`}>{e.dateLabel}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // "bar" — horizontal header timeline
  return (
    <div dir="rtl" className={`relative w-full max-w-3xl min-w-0 ${className}`}>
      {/* connector line behind the dots */}
      <div className="absolute right-0 left-0 top-[4px] h-px bg-primary-foreground/15" />
      <div className="relative flex items-start justify-between gap-1">
        {TIMELINE_EVENTS.map((e, i) => {
          const st = statusOf(i, activeIdx);
          return (
            <div
              key={e.shortName}
              className="flex min-w-0 flex-1 flex-col items-center"
              title={`${e.name} — ${e.dateLabel}`}
            >
              <span className={`h-[9px] w-[9px] rounded-full ${DOT[st]}`} />
              <span className={`mt-1 w-full truncate text-center text-[10px] leading-tight ${NAME[st]}`}>
                {e.shortName}
              </span>
              <span className={`w-full truncate text-center text-[9px] leading-tight ${DATE[st]}`}>
                {e.dateLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
