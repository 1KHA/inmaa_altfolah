// Facts shared across several sections. Sources: the technical proposal deck
// (content_new/قالب العرض الفني للهاكاثون) and جمعية إنماء's contact sheet,
// with the phone and social links cross-checked against inma.org.sa.

export const EVENT = {
  name: "هاكثون الطفولة",
  nameEn: "Childhood Hackathon",
  organizer: "جمعية إنماء لرعاية الطفولة",
  region: "المنطقة الشرقية",
  venue: "مختبر الابتكار بالخبر",
  closingVenue: "مدينة الجبيل",
  dateRange: "8 – 18 نوفمبر 2026",
};

// Hero countdown target in Riyadh time (UTC+3)
export const REGISTRATION_DEADLINE = {
  date: "23 أكتوبر 2026",
  at: "2026-10-23T23:59:00+03:00",
};

// Target of every «سجل الآن» button: the platform's team registration form
export const REGISTER_URL = "/register-team";

export const CONTACT = {
  phoneDisplay: "0501 095 095",
  phoneHref: "tel:+966501095095",
  email: "info@inma.org.sa",
  website: "https://inma.org.sa/",
  websiteDisplay: "inma.org.sa",
  handle: "@inma1237",
  x: "https://x.com/inma1237",
  instagram: "https://www.instagram.com/inma1237/",
};

// Home-page anchors used by the header and footer navigation. Rooted at "/" so
// the same header/footer work on /login and /register-team; on the home page
// itself they still just scroll.
export const NAV_LINKS = [
  { href: "/#about", label: "عن الهاكاثون" },
  { href: "/#journey", label: "رحلة المشارك" },
  { href: "/#eligibility", label: "الشروط" },
  { href: "/#prizes", label: "الجوائز" },
  { href: "/#partners", label: "الشركاء" },
];
