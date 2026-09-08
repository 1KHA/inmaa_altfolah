"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "../../../components/ui/use-toast";
import { Loader2, Send, Users } from "lucide-react";

interface MentorLite {
  id: string;
  name: string;
  email: string;
}

interface BookedParticipant {
  id: string;
  name: string;
  email: string;
}

interface Props {
  mentor: MentorLite | null;
  onClose: () => void;
}

/**
 * Admin → mentor messaging dialog.
 *
 * Sends a custom message (dashboard notification and/or email, via the
 * existing /api/admin/broadcast pipeline) to the mentor and/or the
 * participants holding an active booking with that mentor. An optional
 * meeting link is appended to the message body so the admin can distribute
 * the session URL to everyone at once.
 */
export default function MentorMessageDialog({ mentor, onClose }: Props) {
  const { toast } = useToast();
  const [participants, setParticipants] = useState<BookedParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [toMentor, setToMentor] = useState(true);
  const [toParticipants, setToParticipants] = useState(true);
  const [viaDashboard, setViaDashboard] = useState(true);
  const [viaEmail, setViaEmail] = useState(true);
  const [sending, setSending] = useState(false);

  // Load the mentor's active bookings and reset the form on every open.
  useEffect(() => {
    if (!mentor) return;
    setTitle("");
    setBody("");
    setMeetingLink("");
    setToMentor(true);
    setToParticipants(true);
    setViaDashboard(true);
    setViaEmail(true);

    const load = async () => {
      try {
        setParticipantsLoading(true);
        const res = await fetch(`/api/mentor/bookings?mentorId=${mentor.id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const bookings = await res.json();
        const seen = new Map<string, BookedParticipant>();
        for (const b of Array.isArray(bookings) ? bookings : []) {
          if (b.status !== "cancelled" && b.participant?.id && !seen.has(b.participant.id)) {
            seen.set(b.participant.id, {
              id: b.participant.id,
              name: b.participant.name,
              email: b.participant.email,
            });
          }
        }
        setParticipants(Array.from(seen.values()));
      } catch {
        setParticipants([]);
        toast({
          title: "تنبيه",
          description: "تعذر جلب المشاركين الذين حجزوا مع هذا الموجه",
          variant: "destructive",
        });
      } finally {
        setParticipantsLoading(false);
      }
    };
    load();
  }, [mentor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!mentor) return;
    if (!title.trim() || !body.trim()) {
      toast({ title: "خطأ", description: "العنوان ونص الرسالة مطلوبان", variant: "destructive" });
      return;
    }
    if (!toMentor && !toParticipants) {
      toast({ title: "خطأ", description: "اختر مستلماً واحداً على الأقل", variant: "destructive" });
      return;
    }
    if (!viaDashboard && !viaEmail) {
      toast({ title: "خطأ", description: "اختر قناة إرسال واحدة على الأقل", variant: "destructive" });
      return;
    }
    if (toParticipants && !toMentor && participants.length === 0) {
      toast({
        title: "خطأ",
        description: "لا يوجد مشاركون حجزوا مع هذا الموجه",
        variant: "destructive",
      });
      return;
    }

    const selected = [
      ...(toMentor ? [{ type: "mentor" as const, id: mentor.id }] : []),
      ...(toParticipants ? participants.map((p) => ({ type: "participant" as const, id: p.id })) : []),
    ];

    const finalBody = meetingLink.trim()
      ? `${body.trim()}\n\nرابط الاجتماع: ${meetingLink.trim()}`
      : body.trim();

    try {
      setSending(true);
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          body: finalBody,
          emailSubject: title.trim(),
          channels: [
            ...(viaDashboard ? ["dashboard"] : []),
            ...(viaEmail ? ["email"] : []),
          ],
          audience: { type: "selected", selected },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");

      const parts = [];
      if (viaDashboard) parts.push(`${data.broadcast?.notificationCount ?? 0} إشعار لوحة`);
      if (viaEmail) {
        const failed = data.broadcast?.emailFailedCount ?? 0;
        parts.push(
          failed > 0 ? `البريد لم يُرسل (البريد غير مفعّل)` : `${data.queued ?? 0} بريد في قائمة الإرسال`
        );
      }
      toast({ title: "تم الإرسال بنجاح", description: parts.join(" • ") });
      onClose();
    } catch (e) {
      toast({
        title: "فشل الإرسال",
        description: e instanceof Error ? e.message : "حدث خطأ أثناء الإرسال",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!mentor} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl rounded-lg border-0 shadow-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إرسال رسالة — {mentor?.name}</DialogTitle>
          <DialogDescription>
            أرسل بريداً وإشعاراً مخصصاً للموجه وللمشاركين الذين حجزوا معه (مثلاً رابط اجتماع الجلسة)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto p-1">
          <div className="space-y-2">
            <Label htmlFor="msg-title">العنوان / موضوع البريد</Label>
            <Input
              id="msg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: رابط جلسة الإرشاد"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="msg-body">نص الرسالة</Label>
            <Textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="اكتب نص الرسالة هنا..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="msg-link">رابط الاجتماع (اختياري)</Label>
            <Input
              id="msg-link"
              dir="ltr"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/..."
            />
            <p className="text-xs text-muted-foreground">يُضاف الرابط تلقائياً في نهاية الرسالة</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 p-3 border rounded-lg">
              <Label className="font-semibold">المستلمون</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="to-mentor"
                  checked={toMentor}
                  onCheckedChange={(c: boolean) => setToMentor(c)}
                />
                <Label htmlFor="to-mentor" className="font-normal cursor-pointer">
                  الموجه ({mentor?.email})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="to-participants"
                  checked={toParticipants}
                  onCheckedChange={(c: boolean) => setToParticipants(c)}
                />
                <Label htmlFor="to-participants" className="font-normal cursor-pointer">
                  المشاركون الذين حجزوا
                  {participantsLoading ? (
                    <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    ` (${participants.length})`
                  )}
                </Label>
              </div>
              {toParticipants && participants.length > 0 && (
                <div className="text-xs text-muted-foreground flex items-start gap-1">
                  <Users className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="break-words">
                    {participants.map((p) => p.name).join("، ")}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3 p-3 border rounded-lg">
              <Label className="font-semibold">قنوات الإرسال</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="via-dashboard"
                  checked={viaDashboard}
                  onCheckedChange={(c: boolean) => setViaDashboard(c)}
                />
                <Label htmlFor="via-dashboard" className="font-normal cursor-pointer">
                  إشعار في لوحة التحكم
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="via-email"
                  checked={viaEmail}
                  onCheckedChange={(c: boolean) => setViaEmail(c)}
                />
                <Label htmlFor="via-email" className="font-normal cursor-pointer">
                  بريد إلكتروني
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending} className="w-full sm:w-auto">
            إلغاء
          </Button>
          <Button onClick={handleSend} disabled={sending} className="w-full sm:w-auto">
            {sending ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الإرسال...
              </>
            ) : (
              <>
                <Send className="ml-2 h-4 w-4" />
                إرسال
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
