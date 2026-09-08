import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/auth-context";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://mayda-four.dyam.tech'),
  title: "جائزة مايدة محي الدين ناظر للابتكار 4",
  description: "تحدي يجمع طالبات الجامعات السعودية لاستكشاف وتوظيف الابتكارات الجامعية. توفر جائزة مايدة محي الدين ناظر للابتكار هاكاثون الابتكار، فرصة للعمل ضمن فرق تنافسية للعمل على تطوير حلول مبتكرة تسهم في تعزيز الاستدامة وجودة الحياة",
  keywords: [
    "جائزة مايدة محي الدين ناظر للابتكار 4",
    "هاكاثون الابتكار",
    "دار الحكمة",
    "جامعة دار الحكمة",
    "تحدي يجمع طلبة الجامعات لاستكشاف وتوظيف الابتكارات الجامعية",
    "الاستدامة",
    "جودة الحياة",
    "الابتكار الجامعي",
    "فرق تنافسية",
    "حلول مبتكرة"
  ],
  authors: [{ name: "جامعة دار الحكمة" }],
  creator: "جامعة دار الحكمة",
  publisher: "جامعة دار الحكمة",
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
    title: "جائزة مايدة محي الدين ناظر للابتكار 4",
    description: "تحدي يجمع طالبات الجامعات السعودية لاستكشاف وتوظيف الابتكارات الجامعية. توفر جائزة مايدة محي الدين ناظر للابتكار هاكاثون الابتكار، فرصة للعمل ضمن فرق تنافسية للعمل على تطوير حلول مبتكرة تسهم في تعزيز الاستدامة وجودة الحياة",
    url: "https://mayda-four.dyam.tech/",
    siteName: "جائزة مايدة محي الدين ناظر للابتكار 4",
    images: [
      {
        url: "https://mayda-four.dyam.tech/og.png",
        width: 1200,
        height: 630,
        alt: "جائزة مايدة محي الدين ناظر للابتكار 4 - هاكاثون الابتكار في جامعة دار الحكمة"
      }
    ],
    locale: "ar_SA",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "جائزة مايدة محي الدين ناظر للابتكار 4",
    description: "تحدي يجمع طالبات الجامعات السعودية لاستكشاف وتوظيف الابتكارات الجامعية. توفر جائزة مايدة محي الدين ناظر للابتكار هاكاثون الابتكار، فرصة للعمل ضمن فرق تنافسية للعمل على تطوير حلول مبتكرة تسهم في تعزيز الاستدامة وجودة الحياة",
    images: ["https://mayda-four.dyam.tech/og.png"],
    creator: "@DAHUniversity"
  },
  icons: {
    icon: "/favicon.ico",
  },
  alternates: {
    canonical: "https://mayda-four.dyam.tech/",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
