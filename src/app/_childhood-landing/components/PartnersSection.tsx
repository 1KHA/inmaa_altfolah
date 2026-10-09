"use client";

import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { SectionHeading } from "./SectionHeading";
import { EVENT } from "../content/event";

interface Partner {
  name: string;
  logo: string;
}

interface PartnerTier {
  title: string;
  size: "lg" | "md" | "sm";
  columns: string;
  partners: Partner[];
}

// Logos live in public/partners, cropped one by one from the partners sheet
// (public/partners/new_partners.pdf); tiers, their order and the logos inside
// each tier follow that sheet, read right to left.
const logo = (slug: string) => `/partners/${slug}.webp`;

const tiers: PartnerTier[] = [
  {
    title: "شريك استراتيجي",
    size: "lg",
    columns: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    partners: [
      { name: "الهيئة الملكية للجبيل وينبع", logo: logo("rcjy") },
      { name: "صندوق دعم الجمعيات", logo: logo("associations-fund") },
      { name: "مؤسسة فرحان ابن المبارك القحطاني", logo: logo("ibn-almubarak") },
      { name: "نادي القادسية", logo: logo("qadsiah") },
      { name: "غرفة الشرقية", logo: logo("asharqia-chamber") }
    ]
  },
  {
    title: "شريك ماسي",
    size: "lg",
    columns: "grid-cols-2 lg:grid-cols-4",
    partners: [
      { name: "مؤسسة نورة الملاحي الأهلية", logo: logo("noura-almalahi") },
      { name: "مؤسسة العضيبي الخيرية", logo: logo("alodaibi") },
      { name: "طلال الخيرية", logo: logo("talal") },
      { name: "شركة العناية الوطنية", logo: logo("ncc") }
    ]
  },
  {
    title: "شريك ذهبي",
    size: "md",
    columns: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
    partners: [
      { name: "مؤسسة عبدالله السبيعي الخيرية", logo: logo("alsubaie") },
      { name: "مؤسسة سالم بن أحمد بالحمر وعائلته الخيرية", logo: logo("balhamar") },
      { name: "يونيتشارم", logo: logo("unicharm") },
      { name: "فوم", logo: logo("foom") },
      { name: "الفلك", logo: logo("alfalak") },
      { name: "مسك", logo: logo("mesc") }
    ]
  },
  {
    title: "شريك أكاديمي",
    size: "md",
    columns: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    partners: [
      { name: "جامعة الإمام عبدالرحمن بن فيصل", logo: logo("iau") },
      { name: "جامعة الملك عبدالعزيز — كلية علوم الإنسان والتصاميم", logo: logo("kau") },
      { name: "الوقف العلمي بجامعة الملك عبدالعزيز", logo: logo("kau-waqf") },
      { name: "المركز البحثي التطبيقي للقطاع غير الربحي والتنمية المجتمعية", logo: logo("nonprofit-research-center") },
      { name: "أكاديمية الفوزان", logo: logo("alfozan-academy") }
    ]
  }
];

// Side by side on wide screens, as they share one panel on the sheet
const pairedTiers: PartnerTier[] = [
  {
    title: "شريك إعلامي",
    size: "md",
    columns: "grid-cols-2",
    partners: [
      { name: "هيئة الإذاعة والتلفزيون", logo: logo("sba") },
      { name: "صحيفة اليوم", logo: logo("alyaum") }
    ]
  },
  {
    title: "شريك الضيافة",
    size: "md",
    columns: "grid-cols-2 lg:grid-cols-1",
    partners: [{ name: "مقهى ومحمصة شرق", logo: logo("sharq-roastery") }]
  }
];

const closingTiers: PartnerTier[] = [
  {
    title: "شريك منفذ",
    size: "md",
    columns: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    partners: [
      { name: "شركة شباب مجتمعي", logo: logo("shabab-mujtamai") },
      { name: "شركة وادي مكة", logo: logo("wadi-makkah") },
      { name: "مجموعة دان", logo: logo("dan-group") },
      { name: "MAALY Production & Events", logo: logo("maaly") },
      { name: "كدان", logo: logo("kedan") }
    ]
  },
  {
    title: "جهات إشرافية",
    size: "md",
    columns: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    partners: [
      { name: "إمارة المنطقة الشرقية", logo: logo("emirate-eastern") },
      { name: "وزارة الموارد البشرية والتنمية الاجتماعية", logo: logo("hrsd") },
      { name: "المركز الوطني لتنمية القطاع غير الربحي", logo: logo("ncnp") },
      { name: "مجلس الجمعيات الأهلية", logo: logo("ngo-council") },
      { name: "اللجنة التنسيقية لجمعيات الطفولة", logo: logo("childhood-committee") }
    ]
  }
];

// Phones get shorter tiles with less padding: most logos are wide lockups,
// limited by the tile's width there, not its height
const tileSizes = {
  lg: { tile: "h-28 sm:h-40", img: "max-h-20 sm:max-h-28" },
  md: { tile: "h-24 sm:h-32", img: "max-h-16 sm:max-h-20" },
  sm: { tile: "h-24 sm:h-28", img: "max-h-14 sm:max-h-16" }
};

function TierLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <span aria-hidden className="h-px flex-1 bg-border"></span>
      <h3 className="text-lg font-bold text-primary arabic-text">{title}</h3>
      <span aria-hidden className="h-px flex-1 bg-border"></span>
    </div>
  );
}

function LogoTile({ partner, size }: { partner: Partner; size: PartnerTier["size"] }) {
  return (
    <li
      title={partner.name}
      className={`${tileSizes[size].tile} flex items-center justify-center rounded-2xl border border-border/60 bg-white p-2.5 sm:p-4 transition-smooth hover:border-brand-honey hover:shadow-elegant`}
    >
      <img
        src={partner.logo}
        alt={partner.name}
        loading="lazy"
        className={`${tileSizes[size].img} max-w-full w-auto object-contain`}
      />
    </li>
  );
}

function Tier({ tier }: { tier: PartnerTier }) {
  return (
    <div>
      <TierLabel title={tier.title} />
      <ul className={`grid gap-4 ${tier.columns}`}>
        {tier.partners.map((partner) => (
          <LogoTile key={partner.name} partner={partner} size={tier.size} />
        ))}
      </ul>
    </div>
  );
}

export function PartnersSection() {
  const sectionRef = useScrollAnimation();

  return (
    <section id="partners" ref={sectionRef} className="py-20 px-6 scroll-mt-20 bg-card/60 border-y border-border/60 animate-on-scroll">
      <div className="container mx-auto max-w-6xl">
        <SectionHeading title="شركاء النجاح" />

        {/* Organiser */}
        <div className="max-w-xl mx-auto mb-16 rounded-3xl border-2 border-brand-honey bg-white p-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-center sm:text-start">
          <img src={logo("inma")} alt="" className="h-24 w-auto" loading="lazy" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted-foreground">بتنظيم</p>
            <p className="text-2xl font-bold text-primary arabic-text">{EVENT.organizer}</p>
          </div>
        </div>

        <div className="space-y-14">
          {tiers.map((tier) => (
            <Tier key={tier.title} tier={tier} />
          ))}

          <div className="grid lg:grid-cols-[2fr_1fr] gap-14 lg:gap-8">
            {pairedTiers.map((tier) => (
              <Tier key={tier.title} tier={tier} />
            ))}
          </div>

          {closingTiers.map((tier) => (
            <Tier key={tier.title} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}
