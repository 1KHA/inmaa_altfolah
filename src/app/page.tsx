import ChildhoodLanding from "./_childhood-landing/ChildhoodLanding";
import { CONTACT, EVENT } from "./_childhood-landing/content/event";

/*
 * Home page. Renders the Childhood Hackathon landing page
 * (src/app/_childhood-landing, a private folder with no route of its own);
 * this file is only the route + structured data. Title, description, share
 * image and icons are the site-wide ones in the root layout. The previous
 * Mayda landing page still answers at /landing.
 */

const description =
  "هاكثون الطفولة: مختبر إنتاج مكثف لتصميم مبادرات تقنية تخدم الطفل والأسرة، بتنظيم جمعية إنماء لرعاية الطفولة في المنطقة الشرقية، 8 – 18 نوفمبر 2026.";

/* Event rich-result data, served in the HTML so crawlers always see it. */
const structuredData = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: EVENT.name,
  alternateName: EVENT.nameEn,
  description,
  organizer: {
    "@type": "Organization",
    name: EVENT.organizer,
    url: CONTACT.website,
  },
  location: {
    "@type": "Place",
    name: EVENT.venue,
    address: {
      "@type": "PostalAddress",
      addressLocality: "الخبر",
      addressRegion: EVENT.region,
      addressCountry: "SA",
    },
  },
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  startDate: "2026-11-08",
  endDate: "2026-11-18",
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ChildhoodLanding />
    </>
  );
}
