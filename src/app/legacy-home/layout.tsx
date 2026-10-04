import type { Metadata } from "next";

/*
 * The previous image-based home page, kept for reference at /legacy-home.
 * It is no longer linked from anywhere and is excluded from search engines;
 * the coded landing page (src/app/landing) is now the home page.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LegacyHomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
