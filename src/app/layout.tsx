import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/auth-context";
import { Analytics } from "@vercel/analytics/next";

// The typeface (Graphik Arabic) comes from globals.css through Tailwind's font-sans.

const title = "هاكثون الطفولة | Childhood Hackathon";
const description =
  "هاكثون الطفولة: مختبر إنتاج مكثف لتصميم مبادرات تقنية تخدم الطفل والأسرة، بتنظيم جمعية إنماء لرعاية الطفولة في المنطقة الشرقية، 8 – 18 نوفمبر 2026.";
const shareDescription = "من تحدٍ حقيقي إلى فرصة للابتكار، بحلول تقنية تخدم الطفل والأسرة.";
const organizer = "جمعية إنماء لرعاية الطفولة";

export const metadata: Metadata = {
  metadataBase: new URL('https://mayda-four.dyam.tech'),
  title,
  description,
  keywords: ["هاكثون", "هاكثون الطفولة", "الطفولة", "ابتكار", "الطفل", "الأسرة", "التقنية", "جمعية إنماء", "المنطقة الشرقية", "الخبر", "الجبيل"],
  authors: [{ name: organizer }],
  creator: organizer,
  publisher: organizer,
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
  openGraph: {
    title,
    description: shareDescription,
    siteName: "هاكثون الطفولة",
    type: "website",
    locale: "ar_SA",
    images: [{ url: "/brand/og-image.png", alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: shareDescription,
    images: ["/brand/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.ico", sizes: "any" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  alternates: {
    canonical: "https://mayda-four.dyam.tech/",
  }
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
