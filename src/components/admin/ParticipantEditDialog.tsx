"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "../../../components/ui/use-toast";

/** Profile fields an admin may edit (mirrors the whitelist in /api/admin/update-participant). */
export interface EditableParticipant {
  id: string;
  email: string;
  isLeader?: boolean;
  fullName?: string | null;
  contactNumber?: string | null;
  phoneNumber?: string | null;
  gender?: string | null;
  nationalId?: string | null;
  dob?: string | null;
  city?: string | null;
  nationality?: string | null;
  residence?: string | null;
  university?: string | null;
  universityMajor?: string | null;
  major?: string | null;
  education?: string | null;
  professionalField?: string | null;
  employmentStatus?: string | null;
  isUniversityStudent?: boolean | null;
  canAttendHackathon?: boolean | null;
  canAttend?: boolean | null;
}

const TEXT_FIELDS = [
  ["fullName", "الاسم الكامل", "text"],
  ["email", "البريد الإلكتروني", "email"],
  ["contactNumber", "رقم التواصل", "tel"],
  ["phoneNumber", "رقم الجوال", "tel"],
  ["nationalId", "رقم الهوية", "text"],
  ["dob", "تاريخ الميلاد", "text"],
  ["city", "المدينة", "text"],
  ["nationality", "الجنسية", "text"],
  ["residence", "منطقة الإقامة", "text"],
  ["university", "الجامعة", "text"],
  ["universityMajor", "التخصص الجامعي", "text"],
  ["major", "التخصص", "text"],
  ["education", "المؤهل التعليمي", "text"],
  ["professionalField", "المجال المهني", "text"],
  ["employmentStatus", "الحالة الوظيفية", "text"],
] as const;

const BOOL_FIELDS = [
  ["isUniversityStudent", "طالب جامعي"],
  ["canAttendHackathon", "يستطيع التواجد خلال فترة الهاكاثون"],
  ["canAttend", "يمكنه الحضور"],
] as const;

interface Props {
  participant: EditableParticipant | null;
  onClose: () => void;
  /** Called with the saved row (API response) after a successful update. */
  onSaved?: (saved: EditableParticipant & Record<string, unknown>) => void;
  /** Header wording: "العضو" / "قائد الفريق" / "المشارك". */
  subjectLabel?: string;
}

/**
 * Admin edit form for a participant's profile — used by the teams page (team
 * members / leader) and the participants page (individuals). Saves through
 * POST /api/admin/update-participant; status, team, role and password are not
 * editable here. Changing the email makes the server issue fresh credentials
 * to the new address and notify the old one (the toast says so).
 */
export default function ParticipantEditDialog({ participant, onClose, onSaved, subjectLabel }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<EditableParticipant | null>(participant);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(participant ? { ...participant } : null); }, [participant]);

  const label = subjectLabel ?? (participant?.isLeader ? "قائد الفريق" : "المشارك");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    try {
      setSaving(true);
      const payload: Record<string, unknown> = { id: form.id };
      for (const [key] of TEXT_FIELDS) payload[key] = form[key] ?? "";
      for (const [key] of BOOL_FIELDS) payload[key] = Boolean(form[key]);
      const res = await fetch("/api/admin/update-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل في تحديث البيانات");
      const emailChanged = participant && data.email && data.email !== participant.email.toLowerCase();
      toast({
        title: "نجح",
        description: emailChanged
          ? data.emailChange?.credentialsSent
            ? `تم تحديث البيانات، وأُرسلت بيانات دخول جديدة إلى ${data.email} وإشعار إلى البريد السابق`
            : `تم تحديث البيانات وتغيير البريد إلى ${data.email} (لا تُرسل بيانات دخول لحساب غير مقبول بعد)`
          : "تم تحديث البيانات بنجاح",
      });
      onSaved?.(data);
      onClose();
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "فشل في تحديث البيانات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!participant} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl rounded-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات {label}: {participant?.fullName || participant?.email}</DialogTitle>
          <DialogDescription>
            تُحدَّث بيانات الملف الشخصي فقط — الحالة والفريق والدور وكلمة المرور لا تتغير من هنا. عند تغيير البريد الإلكتروني تُرسل بيانات دخول جديدة إلى البريد الجديد ويُبلَّغ البريد السابق.
          </DialogDescription>
        </DialogHeader>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1">
              {TEXT_FIELDS.map(([key, text, type]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`pe-${key}`}>{text}</Label>
                  <Input
                    id={`pe-${key}`}
                    type={type}
                    required={key === "email"}
                    value={(form[key] as string | null | undefined) ?? ""}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label htmlFor="pe-gender">الجنس</Label>
                <select
                  id="pe-gender"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.gender ?? ""}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 justify-end">
                {BOOL_FIELDS.map(([key, text]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                    {text}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">إلغاء</Button>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "جاري الحفظ..." : "حفظ التغييرات"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
