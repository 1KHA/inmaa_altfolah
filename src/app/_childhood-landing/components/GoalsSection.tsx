"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, Users, Target, Library, Rocket, Sprout } from "lucide-react";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";
import { toneAt } from "../lib/brand";

const goals = [
  {
    id: "01",
    icon: Lightbulb,
    title: "نشر ثقافة الابتكار",
    description: "نشر ثقافة الابتكار الموجّه لخدمة الطفولة بين الطلبة والممارسين والعاملين والمهتمين بالمجال."
  },
  {
    id: "02",
    icon: Users,
    title: "تمكين المشاركين",
    description: "تمكين 50 مشاركًا من تطبيق منهجية تصميم المبادرات والعمل ضمن فرق متعددة التخصصات."
  },
  {
    id: "03",
    icon: Target,
    title: "حلول من احتياجات واقعية",
    description: "توجيه المشاركين إلى تطوير حلول تستند إلى احتياجات واقعية وتستجيب لتحديات الطفولة."
  },
  {
    id: "04",
    icon: Library,
    title: "بنك مبادرات",
    description: "إنتاج بنك مبادرات يسهّل على جمعية إنماء مراجعة المبادرات الواعدة وتطويرها واختيار المناسب منها للتجريب."
  },
  {
    id: "05",
    icon: Rocket,
    title: "جاهزية للتطبيق",
    description: "رفع جاهزية المبادرات للتطبيق من خلال تحديد نموذج التشغيل والموارد المطلوبة ومؤشرات القياس الأولية."
  },
  {
    id: "06",
    icon: Sprout,
    title: "استدامة الحلول",
    description: "تأهيل الفرق الفائزة للانضمام إلى برامج حاضنات ومسرعات الأعمال المحلية، لتحويل حلولها إلى مشاريع قائمة ومستدامة."
  }
];

export function GoalsSection() {
  const sectionRef = useScrollAnimation();
  const cardsRef = useScrollAnimation();

  return (
    <section id="goals" ref={sectionRef} className="py-20 px-6 scroll-mt-20 animate-on-scroll">
      <div className="container mx-auto">
        <SectionHeading title="أهداف الهاكاثون" />

        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 stagger-children">
          {goals.map((goal, index) => {
            const IconComponent = goal.icon;
            const tone = toneAt(index);
            return (
              <Card
                key={goal.id}
                className="gradient-card rounded-3xl border-border/60 hover:border-brand-honey transition-smooth shadow-elegant hover:shadow-lg group relative overflow-hidden"
              >
                {/* Colour rule on the reading-start edge, one brand colour per card */}
                <span aria-hidden className={`absolute inset-y-0 start-0 w-1.5 ${tone.bg}`}></span>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div aria-hidden className="text-5xl font-black text-primary/20">{goal.id}</div>
                    <div className={`blob w-14 h-14 flex items-center justify-center ${tone.bg} ${tone.on} group-hover:scale-110 transition-smooth`}>
                      <IconComponent className="w-7 h-7" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-primary arabic-text">{goal.title}</h3>
                    <p className="text-muted-foreground arabic-text leading-relaxed">
                      {goal.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
