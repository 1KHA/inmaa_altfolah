"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "../../../components/ui/use-toast";

interface Template {
  key: string;
  label: string;
  category: "admin" | "participant" | "mentor";
  variables: string[];
  type: string;
  bulk: boolean;
  dashboardTitle: string;
  dashboardMessage: string;
  emailSubject: string;
  emailBody: string;
  emailEnabled: boolean;
  isCustomized: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  admin: "إشعارات المشرفين",
  participant: "إشعارات المشاركين",
  mentor: "إشعارات المرشدين",
};

function TemplateRow({
  template,
  onSaved,
}: {
  template: Template;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(template);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => setForm(template), [template]);

  const save = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/email-templates/${template.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dashboardTitle: form.dashboardTitle,
          dashboardMessage: form.dashboardMessage,
          emailSubject: form.emailSubject,
          emailBody: form.emailBody,
          emailEnabled: form.emailEnabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "فشل حفظ القالب");
      toast({ title: "نجاح", description: `تم حفظ قالب «${template.label}»` });
      onSaved();
    } catch (err) {
      toast({
        title: "خطأ",
        description: err instanceof Error ? err.message : "فشل حفظ القالب",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      const response = await fetch(`/api/admin/email-templates/${template.key}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("فشل استرجاع النص الافتراضي");
      toast({ title: "نجاح", description: "تم استرجاع النص الافتراضي" });
      onSaved();
    } catch (err) {
      toast({
        title: "خطأ",
        description: err instanceof Error ? err.message : "فشل الاسترجاع",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-right"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium text-sm">{template.label}</span>
          {template.isCustomized && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-[#f9d69f]/40 text-[#5e1213]">مخصص</span>
          )}
          {!template.emailEnabled && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
              البريد معطل
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="p-4 border-t space-y-4">
          {template.variables.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              المتغيرات المتاحة:{" "}
              {template.variables.map((v) => (
                <code key={v} className="mx-1 px-1.5 py-0.5 bg-muted rounded" dir="ltr">
                  {`{{${v}}}`}
                </code>
              ))}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">هذا القالب بدون متغيرات.</p>
          )}
          {template.variables.includes("password") && (
            <p className="text-xs text-[#80191a]">
              يُرسل هذا البريد لكل مستلم على حدة ببياناته الخاصة: <code dir="ltr">{"{{email}}"}</code>{" "}
              و <code dir="ltr">{"{{password}}"}</code> و <code dir="ltr">{"{{loginUrl}}"}</code> —
              كلمة المرور تُنشأ عند القبول ولا تصل إلا لصاحبها.
            </p>
          )}
          {template.bulk && (
            <p className="text-xs text-amber-600">
              هذا الإشعار يُرسل بريدياً كمجموعات (نسخة مخفية) — نفس النص للجميع، لا يمكن استخدام
              متغيرات خاصة بكل مستلم.
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>عنوان الإشعار (لوحة التحكم)</Label>
              <Input
                value={form.dashboardTitle}
                onChange={(e) => setForm({ ...form, dashboardTitle: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>عنوان البريد الإلكتروني</Label>
              <Input
                value={form.emailSubject}
                onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>نص الإشعار (لوحة التحكم)</Label>
              <Textarea
                rows={3}
                value={form.dashboardMessage}
                onChange={(e) => setForm({ ...form, dashboardMessage: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>نص البريد الإلكتروني</Label>
              <Textarea
                rows={3}
                value={form.emailBody}
                onChange={(e) => setForm({ ...form, emailBody: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`email-${template.key}`}
              checked={form.emailEnabled}
              onCheckedChange={(v) => setForm({ ...form, emailEnabled: v === true })}
            />
            <Label htmlFor={`email-${template.key}`}>إرسال بريد إلكتروني لهذا الإشعار</Label>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} size="sm" className="bg-[#80191a] hover:bg-[#80191a]">
              <Save className="ml-2 h-4 w-4" />
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            {template.isCustomized && (
              <Button onClick={reset} variant="outline" size="sm">
                <RotateCcw className="ml-2 h-4 w-4" />
                استرجاع النص الافتراضي
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/email-templates", { credentials: "include" });
      if (!response.ok) throw new Error("تعذر تحميل القوالب");
      const data = await response.json();
      setTemplates(data.templates || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  if (loading) return <p className="text-center p-4">جاري تحميل البيانات...</p>;
  if (error) return <p className="text-center p-4 text-red-500">{error}</p>;

  const categories = ["admin", "participant", "mentor"] as const;

  return (
    <div className="space-y-6">
      {categories.map((cat) => {
        const list = templates.filter((t) => t.category === cat);
        if (list.length === 0) return null;
        return (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="text-lg">{CATEGORY_LABELS[cat]}</CardTitle>
              <CardDescription>
                عدّل نص الإشعار الظاهر في لوحة التحكم ونص البريد الإلكتروني لكل نوع.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.map((t) => (
                <TemplateRow key={t.key} template={t} onSaved={fetchTemplates} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
