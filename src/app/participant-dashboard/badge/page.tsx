"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import BadgeCard from "@/components/attendance/badge-card";

interface BadgeData {
  badgeCode: string;
  fullName: string;
  email: string;
  teamName: string | null;
}

export default function BadgePage() {
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBadge = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/participant/badge", { credentials: "include" });
        if (!response.ok) throw new Error("تعذر تحميل البطاقة");
        setBadge(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
      } finally {
        setLoading(false);
      }
    };
    fetchBadge();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-3xl font-bold">بطاقتي</h1>
        {badge && (
          <Button onClick={() => window.print()} className="bg-primary hover:bg-primary-dark">
            <Printer className="ml-2 h-4 w-4" />
            طباعة البطاقة
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center p-4">جاري تحميل البيانات...</p>
      ) : error ? (
        <p className="text-center p-4 text-red-500">{error}</p>
      ) : badge ? (
        <>
          <BadgeCard
            fullName={badge.fullName}
            teamName={badge.teamName}
            badgeCode={badge.badgeCode}
          />
          <p className="text-center text-sm text-muted-foreground print:hidden">
            هذه بطاقتك الرقمية — يمكنك إبرازها من الجوال أو طباعتها وحملها في الفعاليات.
            يقوم المشرف بمسح الرمز لتسجيل حضورك تلقائياً.
          </p>
        </>
      ) : null}
    </div>
  );
}
