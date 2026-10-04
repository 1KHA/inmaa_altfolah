"use client";

import { useEffect, useState } from "react";
import { REGISTRATION_DEADLINE } from "../content/event";

const units = [
  { key: "days", label: "أيام", accent: "border-b-brand-navy" },
  { key: "hours", label: "ساعات", accent: "border-b-brand-orange" },
  { key: "minutes", label: "دقائق", accent: "border-b-brand-honey" },
  { key: "seconds", label: "ثوانٍ", accent: "border-b-brand-green" },
] as const;

const deadline = new Date(REGISTRATION_DEADLINE.at).getTime();

function getRemaining(now: number) {
  // Clamp at zero so the tiles freeze on 0 once registration has closed
  const diff = Math.max(0, deadline - now);
  return {
    closed: diff === 0,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
  };
}

export function Countdown() {
  // Empty until mounted: the page is prerendered at build time, so a value
  // computed on the server would be stale and break hydration.
  const [remaining, setRemaining] = useState<ReturnType<typeof getRemaining> | null>(null);

  useEffect(() => {
    if (remaining?.closed) return;
    const tick = () => setRemaining(getRemaining(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [remaining?.closed]);

  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold text-primary arabic-text">
        {remaining?.closed ? "انتهى وقت التسجيل" : "الوقت المتبقي على إغلاق التسجيل"}
        <span className="sr-only"> في {REGISTRATION_DEADLINE.date}</span>
      </p>
      {/* role="timer" is implicitly aria-live="off", so screen readers aren't interrupted every second */}
      <div role="timer" className="grid grid-cols-4 gap-2 sm:gap-3 max-w-sm mx-auto lg:mx-0">
        {units.map((unit) => (
          <div
            key={unit.key}
            className={`min-w-0 rounded-2xl border border-border/60 border-b-4 ${unit.accent} bg-card/80 py-3 text-center shadow-elegant`}
          >
            <span className="block text-2xl sm:text-3xl lg:text-4xl font-bold text-primary tabular-nums">
              {!remaining ? "--" : unit.key === "days" ? remaining[unit.key] : String(remaining[unit.key]).padStart(2, "0")}
            </span>
            <span className="text-sm text-muted-foreground">{unit.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
