import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/auth-context";
import { Analytics } from "@vercel/analytics/next";
import { getSiteUrl } from "@/lib/site";
import { EVENT } from "./_childhood-landing/content/event";
import { SITE_TITLE, SITE_DESCRIPTION, SHARE_DESCRIPTION, shareMetadata } from "./seo";

// The typeface (Graphik Arabic) comes from globals.css through Tailwind's font-sans.

// Site-wide defaults. Each public page sets its own canonical URL and og:url
// (pageMetadata in ./seo.ts); a site-wide canonical here would mark every page
// as a duplicate of the home page.
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: SITE_TITLE, template: `%s | ${EVENT.name}` },
  description: SITE_DESCRIPTION,
  applicationName: EVENT.name,
  keywords: ["هاكثون", "هاكثون الطفولة", "الطفولة", "ابتكار", "الطفل", "الأسرة", "التقنية", "جمعية إنماء", "المنطقة الشرقية", "الخبر", "الجبيل"],
  authors: [{ name: EVENT.organizer }],
  creator: EVENT.organizer,
  publisher: EVENT.organizer,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  ...shareMetadata(SITE_TITLE, SHARE_DESCRIPTION),
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF4EA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <AuthProvider>
          {children}
          <Toaster />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
