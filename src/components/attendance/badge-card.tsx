"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface BadgeCardProps {
  fullName: string;
  teamName?: string | null;
  badgeCode: string;
}

/**
 * The digital badge — brand header, participant identity, QR code.
 * Wrapped in #print-badge so the @media print rules can isolate it.
 */
export default function BadgeCard({ fullName, teamName, badgeCode }: BadgeCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(badgeCode, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#182f4e", light: "#ffffff" }, // --brand-navy-dark
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => console.error("QR generation failed:", err));
    return () => {
      cancelled = true;
    };
  }, [badgeCode]);

  return (
    <div
      id="print-badge"
      className="mx-auto w-full max-w-sm rounded-2xl border-2 border-primary bg-white shadow-lg overflow-hidden"
      dir="rtl"
    >
      <div className="bg-primary text-primary-foreground px-6 py-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-horizontal-light.svg" alt="هاكثون الطفولة" className="h-12 mx-auto" />
        <div className="text-xs opacity-80 mt-2">بطاقة مشارك</div>
      </div>
      {/* The identity's four colour plates */}
      <div aria-hidden className="flex h-[3px]">
        <span className="flex-1 bg-brand-navy" />
        <span className="flex-1 bg-brand-orange" />
        <span className="flex-1 bg-brand-honey" />
        <span className="flex-1 bg-brand-green" />
      </div>

      <div className="px-6 py-5 text-center space-y-1">
        <div className="text-lg font-bold text-gray-900">{fullName}</div>
        {teamName ? (
          <div className="text-sm text-gray-600">فريق: {teamName}</div>
        ) : (
          <div className="text-sm text-gray-600">مشارك فردي</div>
        )}
      </div>

      <div className="flex justify-center pb-2">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="رمز الحضور" className="w-56 h-56" />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center text-sm text-gray-400">
            جاري إنشاء الرمز...
          </div>
        )}
      </div>

      <div className="pb-5 text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-honey/20 text-primary-dark text-xs font-mono tracking-wider" dir="ltr">
          {badgeCode}
        </span>
      </div>

      <div className="bg-brand-cream border-t px-6 py-2 text-center text-[10px] text-muted-foreground">
        أبرِز هذه البطاقة للمشرف عند الدخول لتسجيل حضورك
      </div>
    </div>
  );
}
