"use client";

import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, MailCheck, GraduationCap, MessagesSquare, Presentation, Rocket } from "lucide-react";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";
import { EVENT } from "../content/event";
import { toneAt } from "../lib/brand";

const journeyStages = [
  {
    phase: "1",
    title: "التسجيل وتكوين الفرق",
    date: "4 – 23 أكتوبر 2026",
    mode: "إلكتروني",
    icon: UserPlus
  },
  {
    phase: "2",
    title: "القبول",
    date: "24 أكتوبر 2026",
    mode: "إلكتروني",
    icon: MailCheck
  },
  {
    phase: "3",
    title: "ورش العمل",
    date: "8 – 11 نوفمبر 2026",
    mode: `حضوري · ${EVENT.venue}`,
    icon: GraduationCap
  },
  {
    phase: "4",
    title: "الإرشاد والتوجيه",
    date: "خلال فترة الهاكاثون",
    mode: `حضوري · ${EVENT.venue}`,
    icon: MessagesSquare
  },
  {
    phase: "5",
    title: "العرض النهائي",
    date: "19 نوفمبر 2026",
    mode: `حضوري · ${EVENT.closingVenue}`,
    icon: Presentation
  }
];

export function JourneySection() {
  const sectionRef = useScrollAnimation();
  const timelineRef = useScrollAnimation();

  return (
    <section id="journey" ref={sectionRef} className="py-20 px-6 scroll-mt-20 animate-on-scroll">
      <div className="container mx-auto">
        <SectionHeading title="رحلة المشارك" />

        <div className="relative max-w-4xl mx-auto">
          <p className="mb-12 flex items-center justify-center gap-2 text-lg text-primary arabic-text">
            <Rocket className="w-5 h-5 text-accent" aria-hidden />
            إطلاق الهاكاثون: <strong className="font-bold">4 أكتوبر 2026</strong>
          </p>

          <div ref={timelineRef} className="space-y-12 stagger-children">
            {journeyStages.map((stage, index) => {
              const IconComponent = stage.icon;
              const isEven = index % 2 === 0;
              const tone = toneAt(index);

              return (
                <div
                  key={stage.phase}
                  className={`flex items-center gap-8 ${isEven ? 'md:flex-row-reverse' : ''}`}
                >
                  {/* Timeline dot */}
                  <div className={`blob hidden md:flex items-center justify-center w-16 h-16 shadow-lg relative z-10 flex-shrink-0 ${tone.bg}`}>
                    <span className={`text-2xl font-bold ${tone.on}`}>{stage.phase}</span>
                  </div>

                  {/* Content card */}
                  <Card className="gradient-card rounded-3xl border-border/60 hover:border-brand-honey transition-smooth shadow-elegant group flex-1">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className={`blob-alt p-3 ${tone.soft} transition-smooth`}>
                          <IconComponent className="w-6 h-6 text-primary" />
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xl font-bold text-primary arabic-text">
                              <span className="md:hidden">{stage.phase}. </span>{stage.title}
                            </h3>
                            <span className={`text-sm font-medium text-foreground px-3 py-1 rounded-full ${tone.soft}`}>
                              {stage.date}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-primary arabic-text">{stage.mode}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
