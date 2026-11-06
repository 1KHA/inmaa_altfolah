"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Camera, LogOut, ScanLine, Search } from "lucide-react";
import { playScanSound, unlockScanAudio } from "@/lib/scan-sounds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BADGE_PREFIX, hasBadgePrefix } from "@/lib/badge-prefix";

// camera lib must never touch SSR
const QrScanner = dynamic(() => import("@/components/attendance/qr-scanner"), { ssr: false });

/**
 * Organizer (منظم) page: badge scanner for the daily general check-in, and a
 * read-only lookup of active participants. No undo, no event mode, no other
 * admin pages — every API here is under /api/organizer and checks the role.
 */

interface Me {
  name: string;
  username: string;
  today: string;
}

interface ScanResult {
  kind: "checkedIn" | "alreadyCheckedIn" | "rejected";
  message: string;
  name?: string;
  teamName?: string | null;
  date?: string;
}

interface RecentScan {
  name: string;
  time: string;
}

interface SearchRow {
  participantId: string;
  name: string;
  email: string;
  teamName: string | null;
  checkedInToday: boolean;
  checkedInAt: string | null;
}

const RESULT_STYLES: Record<ScanResult["kind"], string> = {
  checkedIn: "bg-green-50 border-green-500 text-green-800",
  alreadyCheckedIn: "bg-brand-cream border-brand-honey text-primary-dark",
  rejected: "bg-red-50 border-red-500 text-red-800",
};

export default function OrganizerDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<"scan" | "search">("scan");

  // ---- session ---------------------------------------------------------------
  const goToLogin = useCallback(() => router.replace("/organizer-login"), [router]);

  useEffect(() => {
    fetch("/api/organizer/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return goToLogin();
        const data = await res.json();
        setMe({ name: data.name, username: data.username, today: data.today });
      })
      .catch(goToLogin);
  }, [goToLogin]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {});
    goToLogin();
  };

  // ---- scanner ---------------------------------------------------------------
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const scanBusyRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showResult = (r: ScanResult) => {
    playScanSound(r.kind === "rejected" ? "error" : r.kind === "alreadyCheckedIn" ? "duplicate" : "success");
    setResult(r);
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => setResult(null), 4000);
  };

  const submitCode = useCallback(
    async (badgeCode: string, method: "scan" | "manual") => {
      if (scanBusyRef.current) return;
      scanBusyRef.current = true;
      try {
        const res = await fetch("/api/organizer/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ badgeCode, method }),
        });
        if (res.status === 401) return goToLogin(); // session expired or account disabled
        const payload = await res.json();
        if (res.ok && payload.success) {
          const kind = payload.result === "alreadyCheckedIn" ? "alreadyCheckedIn" : "checkedIn";
          showResult({
            kind,
            message: kind === "checkedIn" ? "تم تسجيل الدخول ✓" : "سجّل دخوله مسبقاً اليوم",
            name: payload.fullName,
            teamName: payload.teamName,
            date: payload.date,
          });
          if (payload.date) setMe((m) => (m && m.today !== payload.date ? { ...m, today: payload.date } : m));
          if (kind === "checkedIn") {
            setRecent((prev) => [
              { name: payload.fullName, time: new Date().toLocaleTimeString("ar-SA") },
              ...prev.slice(0, 19),
            ]);
          }
        } else {
          showResult({ kind: "rejected", message: payload.error || "فشل تسجيل الحضور" });
        }
      } catch {
        showResult({ kind: "rejected", message: "تعذر الاتصال بالخادم" });
      } finally {
        scanBusyRef.current = false;
      }
    },
    [goToLogin]
  );

  const handleDecoded = useCallback(
    (text: string) => {
      const code = text.trim().toUpperCase();
      if (!hasBadgePrefix(code)) return; // stray QR — ignore silently
      submitCode(code, "scan");
    },
    [submitCode]
  );

  const handleManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    await submitCode(manualCode.trim().toUpperCase(), "manual");
    setManualCode("");
  };

  // ---- search (read-only) ----------------------------------------------------
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/organizer/participants?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.status === 401) return goToLogin();
        const data = await res.json();
        if (!cancelled && res.ok) {
          setRows(data.results ?? []);
          setTruncated(Boolean(data.truncated));
        }
      } catch {
        /* keep last results */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tab, goToLogin]);

  if (!me) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold sm:text-xl">لوحة المنظم</h1>
            <p className="truncate text-sm text-muted-foreground">{me.name}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="ml-1 h-4 w-4" />
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
        <div className="flex gap-2">
          <Button variant={tab === "scan" ? "default" : "outline"} size="sm" onClick={() => setTab("scan")}>
            <ScanLine className="ml-1 h-4 w-4" />
            مسح البطاقات
          </Button>
          <Button variant={tab === "search" ? "default" : "outline"} size="sm" onClick={() => setTab("search")}>
            <Search className="ml-1 h-4 w-4" />
            البحث عن مشارك
          </Button>
        </div>

        {tab === "scan" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5" />
                تسجيل الحضور
              </CardTitle>
              <CardDescription>
                امسح رمز QR من بطاقة المشارك أو أدخل رمز البطاقة يدوياً. يُسجَّل الحضور بتاريخ اليوم (
                <span dir="ltr">{me.today}</span>).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result && (
                <div className={`rounded-md border-r-4 p-4 ${RESULT_STYLES[result.kind]}`}>
                  <div className="text-lg font-bold">{result.message}</div>
                  {result.name && (
                    <div className="mt-1 text-sm">
                      {result.name}
                      {result.teamName ? ` — فريق ${result.teamName}` : ""}
                    </div>
                  )}
                  {result.date && (
                    <div className="mt-1 text-sm">
                      بتاريخ <span dir="ltr">{result.date}</span>
                    </div>
                  )}
                </div>
              )}

              {cameraOn ? (
                <>
                  <QrScanner onScan={handleDecoded} paused={false} />
                  <div className="text-center">
                    <Button variant="outline" size="sm" onClick={() => setCameraOn(false)}>
                      إيقاف الكاميرا
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => { unlockScanAudio(); setCameraOn(true); }} className="bg-primary hover:bg-primary-dark">
                    <Camera className="ml-2 h-4 w-4" />
                    تشغيل الكاميرا للمسح
                  </Button>
                </div>
              )}

              <form onSubmit={handleManual} className="flex flex-col gap-2 md:mx-auto md:max-w-md md:flex-row">
                <Input
                  dir="ltr"
                  className="text-left font-mono"
                  placeholder={`${BADGE_PREFIX}XXXXXXXXXXXX`}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                />
                <Button type="submit" variant="outline" disabled={!manualCode.trim()}>
                  تسجيل يدوي
                </Button>
              </form>

              {recent.length > 0 && (
                <div className="rounded-md border p-3">
                  <h4 className="mb-2 text-sm font-semibold">آخر عمليات التسجيل (هذه الجلسة)</h4>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {recent.map((s, i) => (
                      <div key={i} className="text-sm">
                        {s.name} <span className="text-xs text-muted-foreground">({s.time})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                البحث عن مشارك
              </CardTitle>
              <CardDescription>المشاركون النشطون فقط — للعرض فقط.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="ابحث بالاسم أو البريد أو اسم الفريق..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query.trim().length < 2 ? (
                <p className="text-sm text-muted-foreground">اكتب حرفين على الأقل للبحث.</p>
              ) : searching && rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">جاري البحث...</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="border p-2 text-right">الاسم</th>
                          <th className="border p-2 text-right">الفريق</th>
                          <th className="border p-2 text-right">البريد الإلكتروني</th>
                          <th className="border p-2 text-right">حضور اليوم</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.participantId}>
                            <td className="border p-2">{r.name}</td>
                            <td className="border p-2">{r.teamName || "بدون فريق"}</td>
                            <td className="border p-2" dir="ltr">{r.email}</td>
                            <td className="border p-2">
                              {r.checkedInToday ? (
                                <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
                                  حاضر{r.checkedInAt ? ` — ${new Date(r.checkedInAt).toLocaleTimeString("ar-SA")}` : ""}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">لم يسجل بعد</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {truncated && (
                    <p className="text-xs text-muted-foreground">تظهر أول 50 نتيجة — حدّد البحث أكثر.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
