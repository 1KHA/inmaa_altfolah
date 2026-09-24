"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "../../../components/ui/use-toast";
import { Building2, Loader2, RotateCcw, Save, User, Users } from "lucide-react";

type Mode = "individual" | "organization" | "both";

const OPTIONS: { value: Mode; title: string; body: string; icon: typeof User }[] = [
  {
    value: "individual",
    title: "الحجز مع موجه محدد",
    body: "يرى المشارك أسماء الموجهين ويحجز مع شخص بعينه. يصل الإشعار ورابط الاجتماع لذلك الموجه فقط (السلوك الحالي).",
    icon: User,
  },
  {
    value: "organization",
    title: "الحجز مع الجهة فقط",
    body: "يرى المشارك الجهات (بالشعار) دون أسماء الأشخاص، ويحجز مع الجهة. يصل الإشعار ورابط الاجتماع لجميع أعضاء الجهة.",
    icon: Building2,
  },
  {
    value: "both",
    title: "كلا الخيارين",
    body: "يستطيع المشارك الحجز مع جهة أو مع موجه محدد؛ كل مسار يعمل بسلوكه الخاص.",
    icon: Users,
  },
];

/** Admin control: how participants book mentors (TeamSettings.mentorBookingMode). */
export default function MentorBookingModeSettings() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("individual");
  const [saved, setSaved] = useState<Mode>("individual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Per-participant booking limit + reset mark (TeamSettings.maxBookingsPerMentor / bookingCountResetAt)
  const [maxBookings, setMaxBookings] = useState(3);
  const [savedMax, setSavedMax] = useState(3);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [savingLimit, setSavingLimit] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/team-settings", { credentials: "include" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const m: Mode = ["individual", "organization", "both"].includes(data.mentorBookingMode) ? data.mentorBookingMode : "individual";
        setMode(m); setSaved(m);
        if (typeof data.maxBookingsPerMentor === "number") { setMaxBookings(data.maxBookingsPerMentor); setSavedMax(data.maxBookingsPerMentor); }
        setResetAt(data.bookingCountResetAt ?? null);
      } catch {
        toast({ title: "خطأ", description: "فشل في جلب إعداد طريقة الحجز", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/admin/team-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mentorBookingMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setSaved(data.mentorBookingMode);
      toast({ title: "تم الحفظ", description: "تم تحديث طريقة حجز الموجهين" });
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveLimit = async () => {
    try {
      setSavingLimit(true);
      const res = await fetch("/api/admin/team-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ maxBookingsPerMentor: maxBookings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setSavedMax(data.maxBookingsPerMentor);
      toast({ title: "تم الحفظ", description: `الحد الأقصى للحجوزات مع نفس الموجه/الجهة: ${data.maxBookingsPerMentor}` });
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحفظ", variant: "destructive" });
    } finally {
      setSavingLimit(false);
    }
  };

  const resetCounts = async () => {
    if (!window.confirm("سيبدأ جميع المشاركين عدّاً جديداً من الصفر (لن يُلغى أي حجز قائم). متابعة؟")) return;
    try {
      setResetting(true);
      const res = await fetch("/api/admin/team-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ resetBookingCounts: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إعادة التعيين");
      setResetAt(data.bookingCountResetAt ?? null);
      toast({ title: "تمت إعادة التعيين", description: "أصبح بإمكان جميع المشاركين الحجز من جديد؛ الحجوزات السابقة لم تعد تُحتسب ضمن الحد." });
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل إعادة التعيين", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> طريقة حجز الموجهين</CardTitle>
        <CardDescription>
          يتحكم هذا الإعداد فيما يراه المشاركون في صفحة الموجهين ومع من يستطيعون الحجز. الحالي:{" "}
          <Badge variant="secondary">{OPTIONS.find((o) => o.value === saved)?.title}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="radiogroup">
          {OPTIONS.map((o) => {
            const active = mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(o.value)}
                className={`text-right rounded-lg border p-4 transition-colors ${active ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <o.icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  {o.title}
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{o.body}</p>
              </button>
            );
          })}
        </div>
        <Button onClick={save} disabled={saving || mode === saved} className="w-full sm:w-auto">
          {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
          حفظ طريقة الحجز
        </Button>

        <div className="border-t pt-4 space-y-3">
          <div>
            <div className="font-semibold">الحد الأقصى للحجوزات مع نفس الموجه / الجهة</div>
            <p className="text-xs text-muted-foreground mt-1">
              عدد الحجوزات (غير الملغاة) التي يستطيع المشارك الواحد الاحتفاظ بها مع الموجه نفسه أو الجهة نفسها. إلغاء الحجز (من الإدارة أو الموجه) يعيد الرصيد تلقائياً.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="max-bookings">الحد الأقصى</Label>
              <Input id="max-bookings" type="number" min={1} max={20} value={maxBookings} onChange={(e) => setMaxBookings(Number(e.target.value))} className="w-28" />
            </div>
            <Button onClick={saveLimit} disabled={savingLimit || maxBookings === savedMax || maxBookings < 1} variant="outline">
              {savingLimit ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              حفظ الحد
            </Button>
            <Button onClick={resetCounts} disabled={resetting} variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50">
              {resetting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RotateCcw className="ml-2 h-4 w-4" />}
              إعادة تعيين عدّاد الجميع
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            الحالي: <Badge variant="secondary">{savedMax}</Badge>
            {resetAt && <> · آخر إعادة تعيين: {new Date(resetAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
