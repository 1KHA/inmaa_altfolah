"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { REGISTER_URL } from "../content/event";
import { useScrollAnimation } from "../hooks/useScrollAnimation";

export function CTASection() {
  const sectionRef = useScrollAnimation();

  return (
    <section ref={sectionRef} className="py-20 px-6 relative animate-on-scroll-scale">
      <div className="container mx-auto">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-primary text-primary-foreground px-6 py-16 lg:py-20 text-center">
          {/* Background decoration — flat brand-colour shapes clipped at the corners */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="blob absolute -top-12 -right-12 w-24 h-24 lg:-top-16 lg:w-40 lg:h-40 bg-brand-orange"></div>
            <div className="blob-alt absolute -bottom-16 -left-14 w-28 h-28 lg:-bottom-24 lg:-left-16 lg:w-52 lg:h-52 bg-brand-honey"></div>
            <div className="blob absolute bottom-6 right-[18%] w-8 h-8 lg:bottom-10 lg:w-10 lg:h-10 bg-brand-green"></div>
          </div>

          <div className="max-w-3xl mx-auto space-y-8 relative">
            <h2 className="text-4xl lg:text-6xl font-bold arabic-text leading-tight">
              جاهز لتصميم مبادرة تخدم الطفل والأسرة؟
            </h2>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button
                asChild
                variant="hero"
                size="xl"
                className="transition-bounce hover:scale-105 text-xl px-12 py-4"
              >
                <Link href={REGISTER_URL}>سجل الآن</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
