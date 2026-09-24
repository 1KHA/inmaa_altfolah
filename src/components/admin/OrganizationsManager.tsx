"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "../../../components/ui/use-toast";
import { Building2, Edit, Loader2, Plus, Trash2, Users } from "lucide-react";

export interface OrganizationRow {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  mentors: { id: string; name: string; email: string; specialty: string; status: string; isDisabled: boolean }[];
  _count: { bookings: number };
}

const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg";
const LOGO_MAX = 4 * 1024 * 1024;

/**
 * Admin CRUD for mentor organizations (name, description, logo).
 * Mentors are attached from the mentor add/edit dialogs; this card manages
 * the organizations themselves. `onChanged` lets the page refresh selects.
 */
export default function OrganizationsManager({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<OrganizationRow | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/organizations", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrgs(data.organizations || []);
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب الجهات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setEditing(null); setName(""); setDescription(""); setLogo(null); setRemoveLogo(false); setDialogOpen(true); };
  const openEdit = (o: OrganizationRow) => { setEditing(o); setName(o.name); setDescription(o.description || ""); setLogo(null); setRemoveLogo(false); setDialogOpen(true); };

  const onPickLogo = (file: File | null) => {
    if (!file) { setLogo(null); return; }
    if (!file.type.startsWith("image/")) { toast({ title: "ملف غير مقبول", description: "الشعار يجب أن يكون صورة (PNG, JPG, WEBP, SVG)", variant: "destructive" }); return; }
    if (file.size > LOGO_MAX) { toast({ title: "ملف غير مقبول", description: "حجم الشعار يجب أن يكون أقل من 4 ميجابايت", variant: "destructive" }); return; }
    setLogo(file); setRemoveLogo(false);
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: "خطأ", description: "اسم الجهة مطلوب", variant: "destructive" }); return; }
    try {
      setSaving(true);
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("description", description.trim());
      if (logo) fd.set("logo", logo);
      if (removeLogo) fd.set("removeLogo", "true");
      const res = await fetch(editing ? `/api/admin/organizations/${editing.id}` : "/api/admin/organizations", {
        method: editing ? "PUT" : "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      toast({ title: editing ? "تم التحديث" : "تمت الإضافة", description: `تم حفظ الجهة "${name.trim()}"` });
      setDialogOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/admin/organizations/${toDelete.id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      toast({ title: "تم الحذف", description: `أُزيلت الجهة "${toDelete.name}" وفُكّ ارتباط أعضائها` });
      setToDelete(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحذف", variant: "destructive" });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            الجهات (مجموعات الموجهين)
          </CardTitle>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 rounded-full shrink-0">
          <Plus className="ml-2 h-4 w-4" />
          إضافة جهة
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...</div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">لا توجد جهات بعد. أضف جهة ثم اربط الموجهين بها من نموذج إضافة/تعديل الموجه.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orgs.map((o) => {
              const active = o.mentors.filter((m) => m.status === "active" && !m.isDisabled).length;
              return (
                <div key={o.id} className="flex items-start gap-3 rounded-lg border p-4 min-w-0">
                  {o.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.logoUrl} alt={o.name} className="h-14 w-14 rounded-lg object-contain bg-white border shrink-0" />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Building2 className="h-7 w-7" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold break-words">{o.name}</div>
                    {o.description && <div className="text-xs text-muted-foreground line-clamp-2 break-words">{o.description}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary" className="flex items-center gap-1"><Users className="h-3 w-3" />{o.mentors.length} موجه</Badge>
                      <span className="text-muted-foreground">{active} نشط · {o._count.bookings} حجز</span>
                    </div>
                    {o.mentors.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground break-words" title={o.mentors.map((m) => m.name).join("، ")}>
                        {o.mentors.slice(0, 3).map((m) => m.name).join("، ")}{o.mentors.length > 3 ? ` +${o.mentors.length - 3}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o)} title="تعديل"><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setToDelete(o)} title="حذف"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* create / edit */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !saving && setDialogOpen(v)}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg rounded-lg border-0 shadow-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الجهة" : "إضافة جهة جديدة"}</DialogTitle>
            <DialogDescription>الاسم والشعار يظهران للمشاركين عند اختيار الجهة للحجز.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="org-name">اسم الجهة</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة المياه الوطنية" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-desc">وصف مختصر (اختياري)</Label>
              <Textarea id="org-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-logo">الشعار (اختياري)</Label>
              <div className="flex items-center gap-3">
                {(logo || (editing?.logoUrl && !removeLogo)) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo ? URL.createObjectURL(logo) : editing!.logoUrl!} alt="" className="h-12 w-12 rounded-lg object-contain border bg-white" />
                )}
                <Input id="org-logo" type="file" accept={LOGO_ACCEPT} onChange={(e) => onPickLogo(e.target.files?.[0] || null)} className="flex-1" />
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP أو SVG — بحد أقصى 4 ميجابايت</p>
              {editing?.logoUrl && !logo && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} />
                  إزالة الشعار الحالي
                </label>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="w-full sm:w-auto">إلغاء</Button>
            <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "حفظ التغييرات" : "إضافة الجهة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete */}
      <Dialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <DialogContent dir="rtl" className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>حذف الجهة</DialogTitle>
            <DialogDescription>
              سيتم حذف الجهة "{toDelete?.name}". لن يُحذف الموجهون — سيُفكّ ارتباطهم بالجهة فقط، وتبقى الحجوزات السابقة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)} className="w-full sm:w-auto">إلغاء</Button>
            <Button variant="destructive" onClick={confirmDelete} className="w-full sm:w-auto">حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
