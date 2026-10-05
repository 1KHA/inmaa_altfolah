"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Cpu, MapPin, Users } from "lucide-react";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";
import { EVENT } from "../content/event";
import { toneAt } from "../lib/brand";
import { TEAM_MIN_MEMBERS, TEAM_MAX_MEMBERS } from "@/lib/constants";

const keyFigures = [
  { value: "50", label: "مشاركًا" },
  { value: "12", label: "فريقًا " },
  { value: "5", label: "أيام" },
  { value: "3", label: "فائزين" },
];

const facts = [
  {
    icon: Users,
    title: "الفئة المستهدفة",
    description: `طلبة الجامعات والممارسون والعاملون والمهتمون بمجال الطفولة والابتكار، بإجمالي 50 مشاركًا موزعين على 12 فريقًا بواقع ${TEAM_MIN_MEMBERS}–${TEAM_MAX_MEMBERS} مشاركين لكل فريق.`
  },
  {
    icon: Cpu,
    title: "المسار",
    description: "تصميم مبادرات تقنية تخدم الطفولة، من تشخيص الاحتياج إلى بناء الحل والنموذج الأولي."
  },
  {
    icon: MapPin,
    title: "المكان",
    description: `${EVENT.venue} في ${EVENT.region}، ويُقام الحفل الختامي في ${EVENT.closingVenue}.`
  }
];

export function AboutSection() {
  const sectionRef = useScrollAnimation();
  const factsRef = useScrollAnimation();

  return (
    <section id="about" ref={sectionRef} className="py-20 px-6 scroll-mt-20 animate-on-scroll">
      <div className="container mx-auto">
        <SectionHeading title="عن الهاكاثون" />

        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          <div className="space-y-6">
            <p className="brand-rule text-xl lg:text-2xl font-light text-primary arabic-text leading-relaxed">
              سعيًا لنشر ثقافة الابتكار بين أفراد المجتمع، والمساهمة في إخراج أفكار إبداعية وتقديم حلول مبتكرة تعالج التحديات الاجتماعية والتنموية والاقتصادية بما يتوافق مع الرؤية الوطنية، يأتي «{EVENT.name}» لإيجاد حلول مبتكرة تخدم شريحة الأطفال والعاملين معها، بما يعزز ويفعّل الرصيد الوطني من الطاقات الشابة المبتكرة والمبدعة.
            </p>
          </div>

          {/* Key figures */}
          <dl className="grid grid-cols-2 gap-4">
            {keyFigures.map((figure, index) => (
              <div
                key={figure.label}
                className="gradient-card rounded-3xl border border-border/60 shadow-elegant p-6 relative overflow-hidden flex flex-col-reverse"
              >
                <span aria-hidden className={`blob absolute -top-6 -left-6 w-16 h-16 opacity-80 ${toneAt(index).bg}`}></span>
                <dt className="relative mt-2 text-lg text-muted-foreground arabic-text">{figure.label}</dt>
                <dd className="relative text-5xl lg:text-6xl font-bold text-primary">{figure.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div ref={factsRef} className="grid md:grid-cols-3 gap-6 stagger-children">
          {facts.map((fact, index) => {
            const IconComponent = fact.icon;
            const tone = toneAt(index);
            return (
              <Card key={fact.title} className="gradient-card rounded-3xl border-border/60 shadow-elegant">
                <CardContent className="p-8 space-y-4">
                  <div className={`blob w-12 h-12 flex items-center justify-center ${tone.bg} ${tone.on}`}>
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-primary arabic-text">{fact.title}</h3>
                  <p className="text-muted-foreground arabic-text leading-relaxed">{fact.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
