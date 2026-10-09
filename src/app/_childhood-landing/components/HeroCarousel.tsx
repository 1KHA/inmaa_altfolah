"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface HeroSlide {
  label: string;
  content: ReactNode;
}

/**
 * Cross-fading slides for the hero visual. All slides share one grid cell, so
 * the hero keeps the height of the tallest one instead of jumping on each
 * change. Advances every `interval` ms, pauses while hovered or focused, and
 * never auto-advances for visitors who prefer reduced motion — the dots
 * switch slides for everyone.
 */
export function HeroCarousel({ slides, interval = 5000 }: { slides: HeroSlide[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % slides.length), interval);
    return () => window.clearInterval(id);
  }, [paused, slides.length, interval]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="الشعار والرعاية الكريمة"
      className="w-full max-w-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="grid">
        {slides.map((slide, i) => (
          <div
            key={slide.label}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} من ${slides.length}: ${slide.label}`}
            aria-hidden={i !== active}
            className={`col-start-1 row-start-1 flex items-center justify-center transition-opacity duration-700 ${
              i === active ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {slide.content}
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.label}
            type="button"
            onClick={() => setActive(i)}
            aria-label={slide.label}
            aria-current={i === active}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              i === active ? "w-8 bg-primary" : "w-2.5 bg-primary/25 hover:bg-primary/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
