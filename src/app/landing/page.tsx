import type { Metadata } from "next";
import Landing from "./Landing";

/*
 * The previous project's landing page, kept for reference only. Not linked
 * from anywhere and excluded from search engines; the home page
 * (src/app/_childhood-landing) is the current landing page.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LandingPage() {
  return <Landing />;
}
