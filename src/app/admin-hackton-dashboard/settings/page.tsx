"use client";

import { useEffect, useState } from "react";
import { Mail, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "../../../../components/ui/use-toast";
import TemplateEditor from "@/components/notifications/template-editor";
import BroadcastComposer from "@/components/notifications/broadcast-composer";
import MemberWindowSettings from "@/components/admin/MemberWindowSettings";

interface EmailSettingsForm {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string; // always starts blank; blank = keep saved
  fromEmail: string;
  fromName: string;
  adminInboxEmail: string;
  enabled: boolean;
  hasPassword: boolean;
}

const EMPTY_FORM: EmailSettingsForm = {
  host: "",
  port: "587",
  secure: false,
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
  adminInboxEmail: "",
  enabled: false,
  hasPassword: false,
};

export default function SettingsPage() {
  const [form, setForm] = useState<EmailSettingsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/email-settings", { credentials: "include" });
      if (!response.ok) throw new Error("تعذر تحميل الإعدادات");
      const data = await response.json();
      setForm({
        host: data.host || "",
        port: String(data.port ?? 587),
        secure: Boolean(data.secure),
        username: data.username || "",
        password: "",
        fromEmail: data.fromEmail || "",
        fromName: data.fromName || "",
        adminInboxEmail: data.adminInboxEmail || "",
        enabled: Boolean(data.enabled),
        hasPassword: Boolean(data.hasPassword),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const response = await fetch("/api/admin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          host: form.host,
          port: Number.parseInt(form.port, 10),
          secure: form.secure,
          username: form.username,
          ...(form.password ? { password: form.password } : {}),
          fromEmail: form.fromEmail,
          fromName: form.fromName,
          adminInboxEmail: form.adminInboxEmail,
          enabled: form.enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "فشل حفظ الإعدادات");

      setForm((prev) => ({ ...prev, password: "", hasPassword: Boolean(data.hasPassword) }));
      toast({ title: "نجاح", description: "تم حفظ إعدادات البريد الإلكتروني" });
    } catch (err) {
      toast({
        title: "خطأ",
        description: err instanceof Error ? err.message : "فشل حفظ الإعدادات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const response = await fetch("/api/admin/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          toEmail: testEmail,
          host: form.host,
          port: Number.parseInt(form.port, 10),
          secure: form.secure,
          username: form.username,
          ...(form.password ? { password: form.password } : {}),
          fromEmail: form.fromEmail,
          fromName: form.fromName,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult({ ok: true, message: "تم إرسال رسالة الاختبار بنجاح — تحقق من صندوق الوارد" });
      } else {
        setTestResult({ ok: false, message: data.error || "فشل إرسال رسالة الاختبار" });
      }
    } catch {
      setTestResult({ ok: false, message: "تعذر الاتصال بالخادم" });
    } finally {
      setTesting(false);
    }
  };

  const field = (
    id: keyof EmailSettingsForm,
    label: string,
    type: string = "text",
    placeholder: string = ""
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        dir="ltr"
        className="text-left"
        placeholder={placeholder}
        value={String(form[id])}
        onChange={(e) => setForm({ ...form, [id]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">الإعدادات والرسائل</h1>

      <Tabs defaultValue="smtp" dir="rtl">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="smtp">إعدادات البريد (SMTP)</TabsTrigger>
          <TabsTrigger value="templates">قوالب الإشعارات</TabsTrigger>
          <TabsTrigger value="broadcast">إرسال رسالة</TabsTrigger>
          <TabsTrigger value="team">إعدادات الفرق</TabsTrigger>
        </TabsList>

        <TabsContent value="smtp">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                إعدادات خادم البريد الإلكتروني
              </CardTitle>
              <CardDescription>
                عند تفعيل الإرسال، سيتم إرسال بريد إلكتروني لكل إشعار يظهر في لوحات التحكم.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center p-4">جاري تحميل البيانات...</p>
              ) : error ? (
                <p className="text-center p-4 text-red-500">{error}</p>
              ) : (
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    {field("host", "خادم SMTP", "text", "smtp.example.com")}
                    {field("port", "المنفذ", "number", "587")}
                    {field("username", "اسم المستخدم")}
                    <div className="grid gap-2">
                      <Label htmlFor="password">
                        كلمة المرور{" "}
                        {form.hasPassword && (
                          <span className="text-xs text-muted-foreground">
                            (محفوظة — اتركها فارغة للإبقاء عليها)
                          </span>
                        )}
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        dir="ltr"
                        className="text-left"
                        placeholder={form.hasPassword ? "••••••••" : ""}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                    </div>
                    {field("fromEmail", "بريد المُرسِل", "email", "noreply@example.com")}
                    {field("fromName", "اسم المُرسِل", "text", "جائزة مايدة محي الدين ناظر للابتكار")}
                    {field(
                      "adminInboxEmail",
                      "بريد إشعارات المشرفين (صندوق مشترك)",
                      "email",
                      "admins@example.com"
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="secure"
                      checked={form.secure}
                      onCheckedChange={(v) => setForm({ ...form, secure: v === true })}
                    />
                    <Label htmlFor="secure">اتصال مشفر (SSL/TLS — عادة مع المنفذ 465)</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enabled"
                      checked={form.enabled}
                      onCheckedChange={(v) => setForm({ ...form, enabled: v === true })}
                    />
                    <Label htmlFor="enabled" className="font-semibold">
                      تفعيل إرسال إشعارات البريد الإلكتروني
                    </Label>
                  </div>

                  <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="ml-2 h-4 w-4" />
                    {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
                  </Button>
                </form>
              )}

              <div className="mt-8 border-t pt-6">
                <h3 className="font-semibold mb-3">اختبار الإعدادات</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  يتم الاختبار بالقيم المدخلة في النموذج أعلاه حتى قبل حفظها.
                </p>
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    type="email"
                    dir="ltr"
                    className="text-left md:max-w-sm"
                    placeholder="أدخل بريدًا لاستلام رسالة الاختبار"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testing || !testEmail}
                    onClick={handleTest}
                  >
                    <Send className="ml-2 h-4 w-4" />
                    {testing ? "جاري الإرسال..." : "إرسال رسالة اختبار"}
                  </Button>
                </div>
                {testResult && (
                  <p
                    className={`mt-3 text-sm ${testResult.ok ? "text-green-600" : "text-red-500"}`}
                    dir="auto"
                  >
                    {testResult.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <TemplateEditor />
        </TabsContent>

        <TabsContent value="broadcast">
          <BroadcastComposer />
        </TabsContent>

        <TabsContent value="team">
          <MemberWindowSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
