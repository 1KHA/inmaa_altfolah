import type { Metadata } from "next";
import { EVENT } from "./_childhood-landing/content/event";

/*
 * Search and link-preview texts (Google, WhatsApp, Teams, X) for the root
 * layout, the public pages and the home page's structured data. Facts come
 * from the landing page's content module so the two cannot drift apart.
 */

export const SITE_TITLE = `${EVENT.name} | ${EVENT.nameEn}`;

export const SITE_DESCRIPTION = `${EVENT.name}: مختبر إنتاج مكثف لتصميم مبادرات تقنية تخدم الطفل والأسرة، بتنظيم ${EVENT.organizer} في ${EVENT.region}، ${EVENT.dateRange}.`;

/** Shorter line for chat previews, which show about two lines. */
export const SHARE_DESCRIPTION = `من تحدٍ حقيقي إلى فرصة للابتكار: حلول تقنية تخدم الطفل والأسرة، ${EVENT.dateRange} في ${EVENT.region}.`;

/** 1200×630 PNG, ~46 KB: well inside WhatsApp's size limit for large previews. */
export const SHARE_IMAGE = {
  url: "/brand/og-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: EVENT.name,
};

/** Open Graph + Twitter card. `path` becomes og:url when given. */
export function shareMetadata(title: string, description: string, path?: string): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      locale: "ar_SA",
      siteName: EVENT.name,
      ...(path ? { url: path } : {}),
      title,
      description,
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}

/**
 * Metadata for one public page: its own canonical URL and a complete share
 * card. Next.js replaces (does not merge) a parent's openGraph/twitter, so
 * each page carries the full set. Without `title` the site title is kept.
 */
export function pageMetadata({ path, title, description }: { path: string; title?: string; description?: string }): Metadata {
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    ...shareMetadata(title ? `${title} | ${EVENT.name}` : SITE_TITLE, description ?? SHARE_DESCRIPTION, path),
  };
}
