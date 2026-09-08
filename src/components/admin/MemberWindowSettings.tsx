"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../../../components/ui/use-toast";
import { CalendarClock, Loader2, Save, Users } from "lucide-react";

interface WindowState {
  allowed: boolean;
  message?: string;
}

/** ISO string → value usable in <input type="datetime-local"> (local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Admin control for the window during which team leaders may add members.
 * Empty fields = no restriction on that side.
 */
export default function MemberWindowSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [maxMembers, setMaxMembers] = useState(30);
  const [windowState, setWindowState] = useState<WindowState | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/team-settings", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStart(toLocalInput(data.memberAddStart));
      setEnd(toLocalInput(data.memberAddEnd));
      setMaxMembers(data.maxMembers ?? 30);
      setWindowState(data.window ?? null);
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب إعدادات إضافة الأعضاء", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (payload: { memberAddStart: string | null; memberAddEnd: string | null }) => {
    try {
      setSaving(true);
      const res = await fetch("/api/admin/team-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setStart(toLocalInput(data.memberAddStart));
      setEnd(toLocalInput(data.memberAddEnd));
      setWindowState(data.window ?? null);
      toast({ title: "تم الحفظ", description: "تم تحديث فترة إضافة الأعضاء بنجاح" });
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "فشل حفظ الإعدادات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () =>
    save({
      // datetime-local values are in the admin's local timezone; Date() parses
      // them as such and toISOString() sends UTC to the server.
      memberAddStart: start ? new Date(start).toISOString() : null,
      memberAddEnd: end ? new Date(end).toISOString() : null,
    });

  const handleClear = () => save({ memberAddStart: null, memberAddEnd: null });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          فترة إضافة أعضاء الفريق
        </CardTitle>
        <CardDescription>
          حدد الفترة التي يُسمح خلالها لقادة الفرق بإضافة أعضاء جدد. اترك الحقل فارغاً لعدم
          التقييد من ذلك الجانب. الحد الأقصى لعدد أعضاء الفريق هو {maxMembers} عضواً.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">الحالة الآن:</span>
          {windowState?.allowed ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              الإضافة متاحة حالياً
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
              الإضافة مغلقة {windowState?.message ? `— ${windowState.message}` : ""}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="win-start">بداية الفترة (اختياري)</Label>
            <input
              id="win-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full p-2 border rounded-md bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="win-end">نهاية الفترة (الموعد النهائي)</Label>
            <input
              id="win-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full p-2 border rounded-md bg-white"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          بعد انتهاء الفترة سيظهر لقائد الفريق: «انتهى الوقت المسموح ولا يمكن إضافة أعضاء
          للفريق بعد الآن.»
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="ml-2 h-4 w-4" />
            )}
            حفظ الفترة
          </Button>
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            إزالة القيود (السماح دائماً)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
