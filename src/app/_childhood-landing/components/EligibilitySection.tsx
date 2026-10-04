"use client";

import { Lightbulb, BadgeCheck, Cpu, ShieldCheck } from "lucide-react";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";
import { toneAt } from "../lib/brand";

const teamConditions = [
  "أن يكون المتقدم طالبًا جامعيًا أو ممارسًا في أحد المجالات المرتبطة بالطفولة أو التقنية أو تصميم الحلول.",
  "يُتاح التقديم للمواطنين والمقيمين إقامة نظامية داخل المملكة العربية السعودية.",
  "أن يتكوّن كل فريق من 4–5 مشاركين.",
  "التقديم عبر نموذج التسجيل وتعبئة جميع الأسئلة بشكل كامل.",
  "الالتزام بحضور جميع فعاليات الهاكاثون.",
  "احترام الجميع وتحمّل مسؤولية السلوك."
];

const projectConditions = [
  {
    icon: Lightbulb,
    title: "وضوح المشكلة وابتكارية الحل"
  },
  {
    icon: BadgeCheck,
    title: "أصالة الفكرة"
  },
  {
    icon: Cpu,
    title: "الارتباط بالمسار التقني وقابلية التطبيق"
  },
  {
    icon: ShieldCheck,
    title: "ضوابط المشاركة"
  }
];

export function EligibilitySection() {
  const sectionRef = useScrollAnimation();
  const listRef = useScrollAnimation();

  return (
    <section id="eligibility" ref={sectionRef} className="py-20 px-6 scroll-mt-20 animate-on-scroll">
      <div className="container mx-auto max-w-6xl">
        <SectionHeading title="شروط المشاركة" />

        {/* Team conditions: an open list, no card, so the text carries the section */}
        <h3 className="brand-rule text-2xl lg:text-3xl font-bold text-primary arabic-text mb-10">شروط تكوين الفرق</h3>
        <ol ref={listRef} className="grid md:grid-cols-2 gap-x-12 gap-y-8 mb-16 stagger-children">
          {teamConditions.map((condition, index) => {
            const tone = toneAt(index);
            return (
              <li key={condition} className="flex items-center gap-5">
                <span className={`blob w-12 h-12 shrink-0 flex items-center justify-center text-xl font-bold ${tone.bg} ${tone.on}`}>
                  {index + 1}
                </span>
                <p className="text-lg lg:text-xl font-medium text-primary arabic-text leading-relaxed">{condition}</p>
              </li>
            );
          })}
        </ol>

        {/* Project conditions: a navy band so the two lists read as distinct steps */}
        <div className="relative overflow-hidden rounded-[2rem] bg-primary text-primary-foreground px-6 py-10 lg:px-12 lg:py-12">
          <span aria-hidden className="blob absolute -bottom-10 -left-10 w-20 h-20 lg:-bottom-12 lg:w-32 lg:h-32 bg-brand-honey"></span>
          <h3 className="relative text-2xl lg:text-3xl font-bold arabic-text mb-8">شروط قبول المشاريع</h3>
          <ul className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0">
            {projectConditions.map((condition) => {
              const IconComponent = condition.icon;
              return (
                <li
                  key={condition.title}
                  className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-4 lg:px-6 lg:first:ps-0 lg:border-s lg:first:border-s-0 border-primary-foreground/15"
                >
                  <span className="blob w-12 h-12 shrink-0 flex items-center justify-center bg-brand-honey text-brand-ink">
                    <IconComponent className="w-6 h-6" aria-hidden />
                  </span>
                  <p className="text-lg font-semibold arabic-text leading-snug">{condition.title}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
