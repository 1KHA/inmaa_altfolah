import { Trophy } from "lucide-react";
import PublicPageShell from "@/components/site/PublicPageShell";
import { EVENT } from "../_childhood-landing/content/event";
import { FINALISTS, FINALISTS_TITLE, arabicDigits } from "../_childhood-landing/content/finalists";
import { toneAt } from "../_childhood-landing/lib/brand";
import { pageMetadata } from "../seo";

// List lives in src/app/_childhood-landing/content/finalists.ts
export const metadata = pageMetadata({
  path: "/finalists",
  title: FINALISTS_TITLE,
  description: `تعرّف على الفرق المتأهلة إلى المرحلة النهائية من ${EVENT.name}، بتنظيم ${EVENT.organizer}.`,
});

export default function FinalistsPage() {
  const finalists = [...FINALISTS].sort((a, b) => a.group - b.group);

  return (
    <PublicPageShell>
      <div className="max-w-5xl mx-auto">
        <div className="text-center space-y-6 mb-12 animate-fade-in-up">
          <div className="blob mx-auto w-20 h-20 flex items-center justify-center bg-brand-honey text-brand-ink glow-accent">
            <Trophy className="w-10 h-10" aria-hidden />
          </div>
          <h1 className="brand-pill text-3xl lg:text-4xl leading-normal arabic-text">{FINALISTS_TITLE}</h1>
          <p className="text-lg sm:text-xl text-muted-foreground arabic-text max-w-2xl mx-auto">
            تهانينا للفرق الـ{arabicDigits(finalists.length)} المتأهلة إلى المرحلة النهائية من {EVENT.name}
          </p>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {finalists.map((team, i) => {
            const tone = toneAt(i);
            return (
              <li
                key={team.group}
                className="gradient-card rounded-3xl border border-border/60 shadow-elegant p-6 flex items-center gap-5 animate-fade-in-up"
                // "both" holds the hidden start frame during the delay, and the
                // card stays visible wherever the animation doesn't run
                style={{ animationDelay: `${0.1 + i * 0.07}s`, animationFillMode: "both" }}
              >
                <div className={`blob shrink-0 w-16 h-16 flex items-center justify-center ${tone.bg} ${tone.on}`}>
                  <span className="text-2xl font-black">{arabicDigits(team.group)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">مجموعة {arabicDigits(team.group)}</p>
                  <h2 className="text-2xl font-bold text-primary arabic-text break-words">{team.name}</h2>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </PublicPageShell>
  );
}
