import ChildhoodLanding from "./_childhood-landing/ChildhoodLanding";
import { CONTACT, EVENT } from "./_childhood-landing/content/event";
import { getSiteUrl } from "@/lib/site";
import { SITE_DESCRIPTION, SHARE_IMAGE, pageMetadata } from "./seo";

/*
 * Home page. Renders the Childhood Hackathon landing page
 * (src/app/_childhood-landing, a private folder with no route of its own);
 * this file is only the route + metadata + structured data. Title,
 * description, share image and icons are the site-wide ones (./seo.ts).
 */

export const metadata = pageMetadata({ path: "/" });

const siteUrl = getSiteUrl();

/* Event rich-result data, served in the HTML so crawlers always see it. */
const structuredData = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: EVENT.name,
  alternateName: EVENT.nameEn,
  description: SITE_DESCRIPTION,
  url: `${siteUrl}/`,
  image: [`${siteUrl}${SHARE_IMAGE.url}`],
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
  endDate: "2026-11-19",
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
