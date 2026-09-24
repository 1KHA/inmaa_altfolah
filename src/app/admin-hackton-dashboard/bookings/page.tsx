"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "../../../../components/ui/use-toast";
import { Building2, CalendarClock, ChevronLeft, ChevronRight, Clock, RefreshCw, Search, Users, Video } from "lucide-react";

const TZ = "Asia/Riyadh";

interface Booking {
  id: string;
  status: string; // booked | cancelled | completed
  meetingUrl: string | null;
  mentorJoinedAt?: string | null;
  participantJoinedAt?: string | null;
  completedAt?: string | null;
  organization: { id: string; name: string; logoUrl: string | null } | null;
  mentor: { id: string; name: string; email: string; specialty: string };
  participant: { id: string; name: string; email: string; phoneNumber: string | null };
  availability: { id: string; startTime: string; endTime: string };
}

/** YYYY-MM-DD of an instant in Riyadh (en-CA gives ISO order). */
const dayKey = (iso: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const todayKey = () => dayKey(new Date());
const fmtTime = (iso: string) => new Intl.DateTimeFormat("ar-SA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (key: string) =>
  new Intl.DateTimeFormat("ar-SA", { timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${key}T12:00:00+03:00`));
/** Hour (0–23) of an instant in Riyadh. */
const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));
const shiftDay = (key: string, days: number) => dayKey(new Date(new Date(`${key}T12:00:00+03:00`).getTime() + days * 86_400_000));

const STATUS_LABEL: Record<string, string> = { booked: "محجوز", cancelled: "ملغي", completed: "مكتمل" };
const STATUS_CLASS: Record<string, string> = {
  booked: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * All mentor bookings, organised for the day-to-day view the admin needs:
 * grouped by day (Riyadh time), ordered by start time, defaulting to TODAY,
 * with filters by day / time-of-day / organization / mentor / status / text.
 * Read-only — cancelling and messaging stay on the mentors page.
 */
export default function AdminBookingsPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  // filters
  const [day, setDay] = useState<string>(todayKey());
  const [allDays, setAllDays] = useState(false);
  const [fromHour, setFromHour] = useState(0);
  const [toHour, setToHour] = useState(24);
  const [orgFilter, setOrgFilter] = useState("all"); // all | none | orgId
  const [mentorFilter, setMentorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("booked"); // booked | cancelled | completed | all
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/mentor-bookings", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب الحجوزات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const orgs = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    bookings.forEach((b) => { if (b.organization) m.set(b.organization.id, b.organization); });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [bookings]);
  const mentors = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    bookings.forEach((b) => m.set(b.mentor.id, b.mentor));
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [bookings]);
  const hasUnaffiliated = bookings.some((b) => !b.organization);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings
      .filter((b) => allDays || dayKey(b.availability.startTime) === day)
      .filter((b) => { const h = hourOf(b.availability.startTime); return h >= fromHour && h < toHour; })
      .filter((b) => orgFilter === "all" || (orgFilter === "none" ? !b.organization : b.organization?.id === orgFilter))
      .filter((b) => mentorFilter === "all" || b.mentor.id === mentorFilter)
      .filter((b) => statusFilter === "all" || b.status === statusFilter)
      .filter((b) => !q || [b.mentor.name, b.participant.name, b.participant.email, b.participant.phoneNumber || "", b.organization?.name || "", b.mentor.specialty].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime());
  }, [bookings, allDays, day, fromHour, toHour, orgFilter, mentorFilter, statusFilter, search]);

  // group by day (already time-sorted)
  const groups = useMemo(() => {
    const g: { key: string; items: Booking[] }[] = [];
    for (const b of filtered) {
      const k = dayKey(b.availability.startTime);
      const last = g[g.length - 1];
      if (last && last.key === k) last.items.push(b);
      else g.push({ key: k, items: [b] });
    }
    return g;
  }, [filtered]);

  const todayCount = bookings.filter((b) => b.status === "booked" && dayKey(b.availability.startTime) === todayKey()).length;
  const isToday = !allDays && day === todayKey();

  return (
    <div className="p-3 sm:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-800 flex items-center gap-2">
            <CalendarClock className="h-7 w-7" />
            حجوزات الموجهين
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            اليوم {fmtDay(todayKey())} — <span className="font-semibold text-blue-700">{todayCount}</span> حجز نشط. الأوقات بتوقيت الرياض.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/admin-hackton-dashboard/mentors">إدارة الموجهين والحجوزات</Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Day */}
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="day">اليوم</Label>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" onClick={() => { setAllDays(false); setDay(shiftDay(day, 1)); }} title="اليوم التالي"><ChevronRight className="h-4 w-4" /></Button>
                <Input id="day" type="date" value={day} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setAllDays(false); } }} className="w-[170px]" disabled={allDays} />
                <Button type="button" variant="outline" size="icon" onClick={() => { setAllDays(false); setDay(shiftDay(day, -1)); }} title="اليوم السابق"><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Button type="button" size="sm" variant={isToday ? "default" : "outline"} onClick={() => { setDay(todayKey()); setAllDays(false); }}>اليوم</Button>
              <Button type="button" size="sm" variant={!allDays && day === shiftDay(todayKey(), 1) ? "default" : "outline"} onClick={() => { setDay(shiftDay(todayKey(), 1)); setAllDays(false); }}>غداً</Button>
              <Button type="button" size="sm" variant={allDays ? "default" : "outline"} onClick={() => setAllDays(true)}>كل الأيام</Button>
            </div>
            <div className="space-y-1">
              <Label>الوقت من</Label>
              <Select value={String(fromHour)} onValueChange={(v) => setFromHour(Number(v))}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent dir="ltr">{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>إلى</Label>
              <Select value={String(toHour)} onValueChange={(v) => setToHour(Number(v))}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent dir="ltr">{[...HOURS.slice(1), 24].map((h) => <SelectItem key={h} value={String(h)}>{h === 24 ? "24:00" : hourLabel(h)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {/* Org / mentor / status / search */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>الجهة</Label>
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-500" /><SelectValue placeholder="كل الجهات" /></div></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الجهات</SelectItem>
                  {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  {hasUnaffiliated && <SelectItem value="none">بدون جهة</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الموجه</Label>
              <Select value={mentorFilter} onValueChange={setMentorFilter}>
                <SelectTrigger><div className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /><SelectValue placeholder="كل الموجهين" /></div></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الموجهين</SelectItem>
                  {mentors.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الحالة</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="booked">محجوز</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                  <SelectItem value="all">الكل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="q">بحث</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                <Input id="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="موجه، مشارك، بريد، جوال، جهة..." className="pr-9" />
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {allDays ? "كل الأيام" : fmtDay(day)} · {hourLabel(fromHour)}–{toHour === 24 ? "24:00" : hourLabel(toHour)} · <span className="font-semibold text-blue-700">{filtered.length}</span> حجز
          </div>
        </CardContent>
      </Card>

      {/* Results grouped by day, ordered by time */}
      {loading ? (
        <div className="p-8 text-center text-blue-600">جاري تحميل الحجوزات...</div>
      ) : groups.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent className="p-10 text-center text-muted-foreground">لا توجد حجوزات مطابقة{!allDays ? ` في ${fmtDay(day)}` : ""}.</CardContent></Card>
      ) : (
        groups.map((g) => (
          <Card key={g.key} className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="py-3 bg-blue-50/70">
              <CardTitle className="text-base font-bold text-blue-900 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-blue-600" />
                {fmtDay(g.key)}{g.key === todayKey() && <Badge className="bg-blue-600 text-white">اليوم</Badge>}
                <Badge variant="secondary" className="font-normal">{g.items.length} حجز</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-right">
                      <th className="p-3 font-semibold text-blue-900 w-[130px]">الوقت</th>
                      <th className="p-3 font-semibold text-blue-900">الموجه</th>
                      <th className="p-3 font-semibold text-blue-900">الجهة</th>
                      <th className="p-3 font-semibold text-blue-900">المشارك</th>
                      <th className="p-3 font-semibold text-blue-900 w-[170px]">الحالة / الحضور</th>
                      <th className="p-3 font-semibold text-blue-900 w-[120px] text-center">الاجتماع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((b) => (
                      <tr key={b.id} className="border-t hover:bg-gray-50">
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-semibold" dir="ltr"><Clock className="h-4 w-4 text-gray-500" />{fmtTime(b.availability.startTime)} – {fmtTime(b.availability.endTime)}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{b.mentor.name}</div>
                          <div className="text-xs text-gray-500">{b.mentor.specialty}</div>
                        </td>
                        <td className="p-3">
                          {b.organization ? (
                            <div className="flex items-center gap-2 min-w-0">
                              {b.organization.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={b.organization.logoUrl} alt="" className="h-7 w-7 rounded object-contain border bg-white shrink-0" />
                              ) : <Building2 className="h-4 w-4 text-blue-500 shrink-0" />}
                              <span className="truncate max-w-[160px]" title={b.organization.name}>{b.organization.name}</span>
                            </div>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{b.participant.name}</div>
                          <div className="text-xs text-gray-500 break-all">{b.participant.email}{b.participant.phoneNumber ? ` · ${b.participant.phoneNumber}` : ""}</div>
                        </td>
                        <td className="p-3">
                          <Badge className={STATUS_CLASS[b.status] || "bg-gray-100 text-gray-800"}>{STATUS_LABEL[b.status] || b.status}</Badge>
                          {b.status !== "cancelled" && (
                            <div className="mt-1 space-y-0.5 text-[11px]">
                              <div className={b.mentorJoinedAt ? "text-green-700" : "text-gray-400"}>{b.mentorJoinedAt ? `✓ الموجه انضم ${fmtTime(b.mentorJoinedAt)}` : "— الموجه لم ينضم"}</div>
                              <div className={b.participantJoinedAt ? "text-green-700" : "text-gray-400"}>{b.participantJoinedAt ? `✓ المشارك انضم ${fmtTime(b.participantJoinedAt)}` : "— المشارك لم ينضم"}</div>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {b.meetingUrl && b.status === "booked" ? (
                            <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 h-8 text-xs gap-1">
                              <a href={`/api/meeting/join/${b.id}`} target="_blank" rel="noopener noreferrer"><Video className="h-3.5 w-3.5" />دخول</a>
                            </Button>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
