"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Award } from "lucide-react";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";

// Ordered for the podium: second sits at the reading start, first in the centre
const prizes = [
  { rank: "المركز الثاني", amount: "20,000", icon: Medal, tone: "bg-brand-navy text-brand-cream", order: "order-2 md:order-1", featured: false },
  { rank: "المركز الأول", amount: "30,000", icon: Trophy, tone: "bg-brand-honey text-brand-ink", order: "order-1 md:order-2", featured: true },
  { rank: "المركز الثالث", amount: "10,000", icon: Award, tone: "bg-brand-green text-brand-ink", order: "order-3", featured: false }
];

export function PrizesSection() {
  const sectionRef = useScrollAnimation();
  const cardsRef = useScrollAnimation();

  return (
    <section id="prizes" ref={sectionRef} className="py-20 px-6 scroll-mt-20 relative animate-on-scroll">
      <div className="container mx-auto relative">
        <SectionHeading title="الجوائز" />

        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-end stagger-children">
          {prizes.map((prize) => {
            const IconComponent = prize.icon;
            return (
              <Card
                key={prize.rank}
                className={`gradient-card rounded-3xl shadow-elegant text-center ${prize.order} ${
                  prize.featured ? "border-2 border-brand-honey md:pb-8 glow-accent" : "border-border/60"
                }`}
              >
                <CardContent className={`space-y-4 ${prize.featured ? "p-10" : "p-8"}`}>
                  <div className={`blob mx-auto flex items-center justify-center ${prize.tone} ${prize.featured ? "w-20 h-20" : "w-16 h-16"}`}>
                    <IconComponent className={prize.featured ? "w-10 h-10" : "w-8 h-8"} />
                  </div>
                  <h3 className="text-xl font-bold text-primary arabic-text">{prize.rank}</h3>
                  <p className="text-primary">
                    <span className={`font-black ${prize.featured ? "text-5xl lg:text-6xl" : "text-4xl lg:text-5xl"}`}>{prize.amount}</span>
                    <span className="ms-2 text-lg font-medium text-muted-foreground">ريال</span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
