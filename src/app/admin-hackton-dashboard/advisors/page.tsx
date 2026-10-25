"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Power, Trash2, UserCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/*
 * Advisors (المستشارون) review the teams' practice cards. Adding one creates
 * the account and emails its login details; the password is also shown here
 * once, in case email is switched off.
 */

interface Advisor {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  specialty: string | null;
  isDisabled: boolean;
  createdAt: string;
  reviewCount: number;
}

const EMPTY_FORM = { name: "", email: "", phone: "", specialty: "" };

export default function AdvisorsPage() {
  const [advisors, setAdvisors] = useState<Advisor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [toDelete, setToDelete] = useState<Advisor | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/advisors", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "تعذر تحميل المستشارين");
      setAdvisors(json.advisors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المستشارين");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy("create");
    setFormError(null);
    try {
      const res = await fetch("/api/admin/advisors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "تعذر إضافة المستشار");
      setAdvisors((list) => [...(list ?? []), json.advisor]);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setCredentials({ name: json.advisor.name, email: json.advisor.email, password: json.password });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر إضافة المستشار");
    } finally {
      setBusy(null);
    }
  };

  const patch = async (advisor: Advisor, action: "disable" | "enable" | "resetPassword") => {
    setBusy(`${action}-${advisor.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/advisors/${advisor.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "تعذر تحديث المستشار");
      setAdvisors((list) => list?.map((a) => (a.id === advisor.id ? { ...a, ...json.advisor } : a)) ?? null);
      if (json.password) setCredentials({ name: advisor.name, email: advisor.email, password: json.password });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحديث المستشار");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(`delete-${toDelete.id}`);
    try {
      const res = await fetch(`/api/admin/advisors/${toDelete.id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "تعذر حذف المستشار");
      setAdvisors((list) => list?.filter((a) => a.id !== toDelete.id) ?? null);
      setToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حذف المستشار");
      setToDelete(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserCog className="h-6 w-6" />
            المستشارون
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            يراجع المستشارون نماذج الفرق ويقيّمونها من لوحة المستشار. عند الإضافة تُنشأ كلمة مرور وتُرسل إلى بريد المستشار.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة مستشار
        </Button>
      </div>

      {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Card>}

      {!advisors ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : advisors.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">لم يُضف أي مستشار بعد.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">المستشار</th>
                <th className="px-4 py-3 text-right font-medium">التخصص</th>
                <th className="px-4 py-3 text-right font-medium">الجوال</th>
                <th className="px-4 py-3 text-center font-medium">المراجعات</th>
                <th className="px-4 py-3 text-center font-medium">الحالة</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {advisors.map((advisor) => (
                <tr key={advisor.id} className={cn("border-t", advisor.isDisabled && "bg-muted/30")}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{advisor.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{advisor.email}</p>
                  </td>
                  <td className="px-4 py-3">{advisor.specialty || "—"}</td>
                  <td className="px-4 py-3" dir="ltr">{advisor.phone || "—"}</td>
                  <td className="px-4 py-3 text-center">{advisor.reviewCount}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        advisor.isDisabled ? "bg-gray-200 text-gray-600" : "bg-emerald-50 text-emerald-700"
                      )}
                    >
                      {advisor.isDisabled ? "معطّل" : "نشط"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={advisor.isDisabled || busy !== null}
                        onClick={() => patch(advisor, "resetPassword")}
                        title="إنشاء كلمة مرور جديدة وإرسالها للمستشار"
                      >
                        {busy === `resetPassword-${advisor.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        إرسال بيانات الدخول
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={busy !== null}
                        onClick={() => patch(advisor, advisor.isDisabled ? "enable" : "disable")}
                      >
                        <Power className="h-4 w-4" />
                        {advisor.isDisabled ? "تفعيل" : "تعطيل"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busy !== null}
                        onClick={() => setToDelete(advisor)}
                        aria-label={`حذف ${advisor.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>إضافة مستشار</DialogTitle>
            <DialogDescription>ستُنشأ كلمة مرور وتُرسل مع رابط الدخول إلى بريد المستشار.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(
              [
                ["name", "الاسم", "text", true],
                ["email", "البريد الإلكتروني", "email", true],
                ["phone", "رقم الجوال", "tel", false],
                ["specialty", "التخصص", "text", false],
              ] as const
            ).map(([key, label, type, required]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`advisor-${key}`}>
                  {label} {required && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id={`advisor-${key}`}
                  type={type}
                  dir={type === "email" || type === "tel" ? "ltr" : undefined}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={create} disabled={busy === "create" || !form.name.trim() || !form.email.trim()}>
              {busy === "create" && <Loader2 className="me-1 h-4 w-4 animate-spin" />}
              إضافة
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentials !== null} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>بيانات دخول {credentials?.name}</DialogTitle>
            <DialogDescription>
              أُرسلت إلى بريد المستشار إن كان البريد مفعّلًا في الإعدادات. تظهر كلمة المرور هنا مرة واحدة فقط.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
            <p>
              البريد: <span dir="ltr" className="font-mono">{credentials?.email}</span>
            </p>
            <p>
              كلمة المرور: <span dir="ltr" className="select-all font-mono text-base font-bold">{credentials?.password}</span>
            </p>
            <p className="text-xs text-muted-foreground">يسجّل المستشار دخوله من صفحة الدخول المعتادة (/login).</p>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button onClick={() => setCredentials(null)}>تم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>حذف {toDelete?.name}؟</DialogTitle>
            <DialogDescription>
              يُحذف حساب المستشار ولن يتمكن من الدخول. تبقى مراجعاته السابقة كما هي. للإيقاف المؤقت استخدم «تعطيل» بدلًا من الحذف.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="destructive" onClick={remove} disabled={busy !== null}>
              حذف
            </Button>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
