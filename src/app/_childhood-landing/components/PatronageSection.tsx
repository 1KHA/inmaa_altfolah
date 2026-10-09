"use client";

import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";

// Royal patronage of the hackathon (shown before the partners)
const patron = {
  honorific: "صاحب السمو الملكي الأمير",
  name: "سعود بن نايف بن عبدالعزيز آل سعود",
  position: "أمير المنطقة الشرقية",
  // Cut-out portrait with a transparent background (1068 × 1118)
  image: "/7f4a7299-7e38-4bfb-ab6b-55b971b988da_0.webp",
};

export function PatronageSection() {
  const sectionRef = useScrollAnimation();

  return (
    <section id="patronage" ref={sectionRef} className="py-20 px-6 scroll-mt-20 animate-on-scroll">
      <div className="container mx-auto max-w-5xl">
        <SectionHeading title="الرعاية الكريمة" />

        <div className="gradient-card relative overflow-hidden rounded-[2rem] border border-brand-honey/60 shadow-elegant">
          {/* Navy rule along the top edge, as on the CTA band */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-primary"></span>

          <div className="grid md:grid-cols-[2fr_3fr] items-center gap-8 md:gap-12 px-4 pt-12 md:px-12 md:pt-14">
            {/* Portrait on a quiet circular backdrop, anchored to the card's bottom edge */}
            <div className="relative mx-auto w-full max-w-xs md:max-w-none self-end">
              <div aria-hidden className="absolute inset-x-4 bottom-0 aspect-square rounded-full bg-brand-honey/20"></div>
              <img
                src={patron.image}
                alt={`${patron.honorific} ${patron.name}، ${patron.position}`}
                width={1068}
                height={1118}
                loading="lazy"
                className="relative w-full h-auto"
              />
            </div>

            {/* A size container: the name scales with this column (cqw) so it always fits on one line */}
            <div className="pb-12 md:pb-14 text-center md:text-start space-y-4 [container-type:inline-size]">
              {/* Below lg the name shrinks with its column; these lines shrink with it so it stays the strongest */}
              <p className="text-sm md:text-base lg:text-lg text-muted-foreground arabic-text">تحت رعاية</p>
              <p className="text-sm md:text-lg lg:text-2xl font-medium text-primary arabic-text">{patron.honorific}</p>
              {/* One line at every width: the name is ~14.9× its font size wide, so 6.4cqw
                  fills ~95% of the column; capped at the old desktop size */}
              <h3 className="text-[min(6.4cqw,2.25rem)] whitespace-nowrap font-black text-primary arabic-text leading-snug">{patron.name}</h3>
              <p className="brand-rule inline-block text-sm md:text-lg lg:text-2xl font-bold text-accent arabic-text">
                {patron.position}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
