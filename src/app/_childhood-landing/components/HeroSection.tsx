import Link from "next/link";
import { Button } from "./ui/button";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { EVENT, PATRON, REGISTER_URL } from "../content/event";
import { Countdown } from "./Countdown";
import { HeroCarousel } from "./HeroCarousel";

/** The hackathon mark on a soft honey shape (first slide of the hero carousel). */
function LogoMark() {
  return (
    <div className="relative w-full max-w-md">
      {/* Soft honey shape behind the icon */}
      <div aria-hidden className="blob absolute inset-0 bg-brand-honey/25 scale-110"></div>
      {/* Main image */}
      <img
        src="/brand/logo-icon.svg"
        alt=""
        className="relative z-10 w-full h-auto p-10 transform hover:scale-105 transition-bounce animate-scale-in animation-delay-500"
      />
      {/* Floating organic shapes */}
      <div aria-hidden className="blob absolute -top-6 -right-6 w-16 h-16 bg-brand-green opacity-80 animate-pulse animation-delay-1000"></div>
      <div aria-hidden className="blob-alt absolute -bottom-4 -left-4 w-12 h-12 bg-brand-orange opacity-80 animate-pulse animation-delay-1200"></div>
    </div>
  );
}

/** The royal patron's portrait on a quiet circular backdrop, with the title beneath (second slide). */
function PatronFigure() {
  return (
    <figure className="relative mx-auto w-full max-w-[18rem] sm:max-w-sm lg:max-w-md text-center">
      <div className="relative">
        <div aria-hidden className="absolute inset-x-6 bottom-0 aspect-square rounded-full bg-brand-honey/25"></div>
        <img
          src={PATRON.image}
          alt={`${PATRON.honorific} ${PATRON.name}، ${PATRON.position}`}
          width={1068}
          height={1118}
          className="relative w-full h-auto"
        />
      </div>
      <figcaption className="relative -mt-4 rounded-2xl border border-brand-honey/60 bg-card/95 px-4 py-3 shadow-elegant space-y-0.5">
        <p className="text-xs lg:text-sm text-muted-foreground arabic-text">تحت رعاية</p>
        <p className="text-sm lg:text-base font-medium text-primary arabic-text">{PATRON.honorific}</p>
        <p className="text-base lg:text-xl font-black text-primary arabic-text whitespace-nowrap">{PATRON.name}</p>
        <p className="text-sm lg:text-base font-bold text-accent arabic-text">{PATRON.position}</p>
      </figcaption>
    </figure>
  );
}

export function HeroSection() {
  return (
    <section id="top" className="min-h-screen flex items-center justify-center pt-28 pb-16 px-6 relative overflow-hidden">
      {/* Background decorative elements — organic shapes from the identity's colour plates */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="blob absolute -top-24 -left-24 w-80 h-80 bg-brand-honey/20"></div>
        <div className="blob-alt absolute bottom-10 -right-24 w-72 h-72 bg-brand-green/15"></div>
      </div>

      <div className="container mx-auto grid lg:grid-cols-[3fr_2fr] gap-12 items-center relative">
        {/* Text Content */}
        <div className="text-center lg:text-start space-y-8 order-2 lg:order-1 animate-fade-in-up">
          <div className="space-y-6">
            <h1 className="arabic-text leading-tight pb-4 lg:pb-6 animate-fade-in-up animation-delay-200">
              <span className="block text-5xl lg:text-7xl font-black text-primary">{EVENT.name}</span>
            </h1>
            <p className="brand-rule inline-block text-start text-xl lg:text-[22px] xl:whitespace-nowrap font-light text-primary arabic-text max-w-2xl animate-fade-in-up animation-delay-300">
              المكان الذي تتحوّل فيه الأفكار التقنية إلى حلولٍ حقيقية تخدم الطفل والأسرة.
            </p>
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start animate-fade-in-up animation-delay-400">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-honey bg-card/70 px-4 py-2 text-base font-medium text-primary arabic-text">
                <CalendarDays className="w-4 h-4 text-accent" aria-hidden />
                {EVENT.dateRange}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-honey bg-card/70 px-4 py-2 text-base font-medium text-primary arabic-text">
                <MapPin className="w-4 h-4 text-accent" aria-hidden />
                {EVENT.region} · الخبر
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-honey bg-card/70 px-4 py-2 text-base font-medium text-primary arabic-text">
                <Users className="w-4 h-4 text-accent" aria-hidden />
                50 مشاركًا · 12 فريقًا
              </span>
            </div>
            <div className="pt-4 lg:pt-6 animate-fade-in-up animation-delay-600">
              <Countdown />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start animate-fade-in-up animation-delay-800">
            <Button asChild variant="hero" size="xl" className="transition-bounce hover:scale-105">
              <Link href={REGISTER_URL}>سجل الآن</Link>
            </Button>
            <a href="#about" className="font-semibold text-primary underline-offset-8 hover:underline">
              اعرف المزيد عن الهاكاثون
            </a>
          </div>
        </div>

        <div className="relative order-1 lg:order-2 flex justify-center animate-fade-in-right animation-delay-300">
          <HeroCarousel
            slides={[
              { label: "شعار هاكثون الطفولة", content: <LogoMark /> },
              { label: "الرعاية الكريمة", content: <PatronFigure /> },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
