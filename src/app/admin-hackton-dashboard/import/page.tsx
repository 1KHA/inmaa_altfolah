"use client";

/**
 * Bulk import screen: upload → validated preview → commit.
 *
 * The preview is produced by the server (dry run), never in the browser, and
 * the commit re-uploads the same file so the server validates again before
 * writing. Nothing is created unless every row passes.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, CheckCircle, AlertTriangle, XCircle, FileSpreadsheet } from "lucide-react";
import { useToast } from "../../../../components/ui/use-toast";

type EntityKey = "teams-with-leader" | "teams" | "participants" | "mentors";

const ENTITIES: { key: EntityKey; label: string; hint: string }[] = [
  {
    key: "teams-with-leader",
    label: "الفرق مع القائد (ملف واحد)",
    hint: "الأسهل: كل صف يُنشئ الفريق وقائده معاً. لإضافة بقية الأعضاء لاحقاً استخدم «المشاركون».",
  },
  { key: "teams", label: "الفرق فقط", hint: "استوردها أولاً — المشاركون يشيرون إليها بالاسم" },
  { key: "participants", label: "المشاركون", hint: "يرتبطون بالفرق عبر عمود teamName" },
  { key: "mentors", label: "الموجهون", hint: "مستقلون — أي وقت" },
];

interface RowResult {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}
interface Preview {
  entity: EntityKey;
  headers: string[];
  unknownColumns: string[];
  missingColumns: string[];
  rows: RowResult[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  fatal: string[];
  committed: boolean;
  created?: number;
  error?: string;
}

export default function ImportPage() {
  const { toast } = useToast();
  const [entity, setEntity] = useState<EntityKey>("teams-with-leader");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (commit: boolean) => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("entity", entity);
    body.append("commit", String(commit));
    try {
      setBusy(true);
      const res = await fetch("/api/admin/import", { method: "POST", body, credentials: "include" });
      const data = await res.json();
      if (!res.ok && !data.rows) throw new Error(data.error || "فشل رفع الملف");
      setPreview(data);
      if (data.committed) {
        toast({
          title: "تم الاستيراد",
          description: `تمت إضافة ${data.created} سجل بحالة «قيد المراجعة». يمكنك قبولهم من صفحة ${ENTITIES.find((e) => e.key === entity)?.label}.`,
        });
      } else if (data.error) {
        toast({ title: "لم يتم الاستيراد", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({
        title: "خطأ",
        description: err instanceof Error ? err.message : "فشل رفع الملف",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const canCommit =
    preview && !preview.committed && preview.fatal.length === 0 && preview.errorCount === 0 && preview.validCount > 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold">استيراد البيانات</h1>
        <p className="text-muted-foreground mt-1">
          ارفع ملف CSV أو Excel لإضافة الفرق أو المشاركين أو الموجهين دفعة واحدة. جميع السجلات
          تُضاف بحالة <strong>«قيد المراجعة»</strong> ولا تُقبل تلقائياً.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. اختر النوع والملف</CardTitle>
          <CardDescription>
            القوالب الجاهزة موجودة في مجلد <code dir="ltr">/imports</code> داخل المشروع.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {ENTITIES.map((e) => (
              <Button
                key={e.key}
                type="button"
                variant={entity === e.key ? "default" : "outline"}
                onClick={() => {
                  setEntity(e.key);
                  setPreview(null);
                }}
              >
                {e.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{ENTITIES.find((e) => e.key === entity)?.hint}</p>

          <div className="grid gap-2">
            <Label htmlFor="import-file">الملف (CSV أو XLSX)</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </div>

          <Button onClick={() => send(false)} disabled={!file || busy}>
            <Upload className="ml-2 h-4 w-4" />
            {busy ? "جاري الفحص..." : "فحص الملف"}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. نتيجة الفحص</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.fatal.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 space-y-1">
                {preview.fatal.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{preview.validCount}</div>
                    <div className="text-xs text-muted-foreground">صف صالح</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold text-red-600">{preview.errorCount}</div>
                    <div className="text-xs text-muted-foreground">صف به أخطاء</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{preview.warningCount}</div>
                    <div className="text-xs text-muted-foreground">صف به تنبيهات</div>
                  </div>
                </div>

                {preview.unknownColumns.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
                    أعمدة غير معروفة سيتم تجاهلها: {preview.unknownColumns.join("، ")}
                  </div>
                )}

                {preview.errorCount > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
                    لن يتم استيراد أي صف حتى تُصلح كل الأخطاء. عدّل الملف وأعد الفحص.
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 w-14 text-right">الصف</th>
                        <th className="border p-2 w-24 text-right">الحالة</th>
                        <th className="border p-2 text-right">البيانات</th>
                        <th className="border p-2 text-right">الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => {
                        const bad = r.errors.length > 0;
                        return (
                          <tr key={r.rowNumber} className={bad ? "bg-red-50/60" : r.warnings.length ? "bg-amber-50/50" : ""}>
                            <td className="border p-2">{r.rowNumber}</td>
                            <td className="border p-2">
                              {bad ? (
                                <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" /> خطأ</span>
                              ) : r.warnings.length ? (
                                <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> تنبيه</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="h-3.5 w-3.5" /> صالح</span>
                              )}
                            </td>
                            <td className="border p-2">
                              <span className="text-muted-foreground">
                                {Object.values(r.data).filter(Boolean).slice(0, 4).join(" · ") || "—"}
                              </span>
                            </td>
                            <td className="border p-2">
                              {[...r.errors, ...r.warnings].length === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <ul className="list-disc pr-4 space-y-0.5">
                                  {r.errors.map((e, i) => <li key={`e${i}`} className="text-red-600">{e}</li>)}
                                  {r.warnings.map((w, i) => <li key={`w${i}`} className="text-amber-700">{w}</li>)}
                                </ul>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {preview.committed ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                تمت إضافة {preview.created} سجل بحالة «قيد المراجعة».
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button onClick={() => send(true)} disabled={!canCommit || busy}>
                  <FileSpreadsheet className="ml-2 h-4 w-4" />
                  {busy ? "جاري الاستيراد..." : `استيراد ${preview.validCount} سجل`}
                </Button>
                {!canCommit && preview.fatal.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    {preview.errorCount > 0 ? "أصلح الأخطاء أولاً" : "لا توجد صفوف صالحة"}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
