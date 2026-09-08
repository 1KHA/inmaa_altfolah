"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
  CalendarPlus,
  Bell,
  Loader2,
  ListChecks,
} from "lucide-react";

interface MentorInfo {
  id: string;
  name: string;
  specialty: string;
  status: string;
}

interface Booking {
  id: string;
  status: string;
  meetingUrl?: string | null;
  availability: { id: string; startTime: string; endTime: string };
  participant: { id: string; name: string; email: string; phoneNumber: string };
}

interface Availability {
  id: string;
  startTime: string;
  endTime: string;
}

export default function MentorDashboardPage() {
  const [mentor, setMentor] = useState<MentorInfo | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, bookingsRes, availRes] = await Promise.all([
          fetch("/api/mentor/me", { credentials: "include" }),
          fetch("/api/mentor/bookings", { credentials: "include" }),
          fetch("/api/mentor/availability", { credentials: "include" }),
        ]);

        if (meRes.ok) setMentor(await meRes.json());
        if (bookingsRes.ok) {
          const data = await bookingsRes.json();
          setBookings(Array.isArray(data) ? data : []);
        }
        if (availRes.ok) {
          const data = await availRes.json();
          setAvailabilities(Array.isArray(data) ? data : []);
        }
        if (!meRes.ok && !bookingsRes.ok) {
          setError("تعذر تحميل بيانات لوحة التحكم. يرجى تسجيل الدخول مرة أخرى.");
        }
      } catch {
        setError("حدث خطأ أثناء تحميل البيانات.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>جاري تحميل لوحة التحكم...</span>
        </div>
      </div>
    );
  }

  const now = new Date();
  const activeBookings = bookings.filter((b) => b.status !== "cancelled");
  const uniqueParticipants = new Set(activeBookings.map((b) => b.participant.id)).size;
  const upcoming = bookings
    .filter((b) => b.status === "booked" && new Date(b.availability.startTime) > now)
    .sort(
      (a, b) =>
        new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
    );
  const completedCount = bookings.filter((b) => b.status === "completed").length;
  const cancelledCount = bookings.filter((b) => b.status === "cancelled").length;
  const bookedAvailabilityIds = new Set(activeBookings.map((b) => b.availability.id));
  const openFutureSlots = availabilities.filter(
    (a) => new Date(a.startTime) > now && !bookedAvailabilityIds.has(a.id)
  ).length;
  const nextSession = upcoming[0] ?? null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const stats = [
    {
      title: "المشاركون المحجوزون",
      value: uniqueParticipants,
      caption: "مشارك حجز معك",
      icon: Users,
      color: "blue",
    },
    {
      title: "الجلسات القادمة",
      value: upcoming.length,
      caption: "جلسة قادمة",
      icon: Clock,
      color: "green",
    },
    {
      title: "الجلسات المكتملة",
      value: completedCount,
      caption: "جلسة مكتملة",
      icon: CheckCircle2,
      color: "purple",
    },
    {
      title: "الجلسات الملغاة",
      value: cancelledCount,
      caption: "جلسة ملغاة",
      icon: XCircle,
      color: "red",
    },
    {
      title: "إجمالي الحجوزات",
      value: activeBookings.length,
      caption: "حجز نشط",
      icon: ListChecks,
      color: "yellow",
    },
    {
      title: "مواعيد متاحة للحجز",
      value: openFutureSlots,
      caption: "موعد قادم غير محجوز",
      icon: CalendarPlus,
      color: "cyan",
    },
  ] as const;

  const colorClasses: Record<string, { bg: string; icon: string; value: string }> = {
    blue: { bg: "to-blue-50", icon: "text-blue-500", value: "text-blue-600" },
    green: { bg: "to-green-50", icon: "text-green-500", value: "text-green-600" },
    purple: { bg: "to-purple-50", icon: "text-purple-500", value: "text-purple-600" },
    red: { bg: "to-red-50", icon: "text-red-500", value: "text-red-600" },
    yellow: { bg: "to-yellow-50", icon: "text-yellow-500", value: "text-yellow-600" },
    cyan: { bg: "to-cyan-50", icon: "text-cyan-500", value: "text-cyan-600" },
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">
            مرحباً{mentor ? `، ${mentor.name}` : ""} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {mentor?.specialty ? `${mentor.specialty} • ` : ""}
            هذه نظرة عامة على جلساتك ومواعيدك
          </p>
        </div>
        {mentor && (
          <Badge
            className={
              mentor.status === "active"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
            }
          >
            {mentor.status === "active" ? "نشط" : "بانتظار التفعيل"}
          </Badge>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => {
          const c = colorClasses[s.color];
          return (
            <Card
              key={s.title}
              className={`border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white ${c.bg}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <s.icon className={`h-5 w-5 ${c.icon}`} />
                  {s.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${c.value}`}>{s.value}</div>
                <p className="text-xs text-muted-foreground">{s.caption}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Next session */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            الجلسة القادمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextSession ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
              <div className="min-w-0">
                <div className="font-semibold break-words">{nextSession.participant.name}</div>
                <div className="text-sm text-muted-foreground break-all">
                  {nextSession.participant.email}
                </div>
                <div className="text-sm text-blue-700 mt-1">
                  {fmt(nextSession.availability.startTime)}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
                {nextSession.meetingUrl && (
                  <Button asChild className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                    <a href={nextSession.meetingUrl} target="_blank" rel="noopener noreferrer">
                      دخول الاجتماع
                    </a>
                  </Button>
                )}
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/mentor-dashboard/sessions">عرض كل الجلسات</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-2">
              لا توجد جلسات قادمة حالياً.
              {openFutureSlots === 0 && " أضف مواعيد توفر جديدة ليتمكن المشاركون من الحجز."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Button asChild variant="outline" className="h-auto py-4 justify-start gap-3">
          <Link href="/mentor-dashboard/availability">
            <CalendarPlus className="h-5 w-5 text-blue-600" />
            <span>إدارة مواعيد التوفر</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 justify-start gap-3">
          <Link href="/mentor-dashboard/sessions">
            <ListChecks className="h-5 w-5 text-green-600" />
            <span>جلسات الإرشاد</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 justify-start gap-3">
          <Link href="/mentor-dashboard/notifications">
            <Bell className="h-5 w-5 text-yellow-600" />
            <span>الإشعارات</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
