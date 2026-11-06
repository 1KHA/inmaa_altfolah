"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PublicPageShell from "@/components/site/PublicPageShell";

/** Organizer (منظم) sign-in — username + password, then the scanner page. */
export default function OrganizerLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // already signed in as an organizer → straight to the scanner
  useEffect(() => {
    fetch("/api/organizer/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) router.replace("/organizer-dashboard");
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/organizer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        router.replace("/organizer-dashboard");
        return;
      }
      setError(data.error || "تعذر تسجيل الدخول");
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  return (
    // Header and footer shared with /login and the home page
    <PublicPageShell>
      <div className="max-w-md mx-auto">
        <Card className="gradient-card rounded-3xl border-border/60 shadow-elegant">
          <CardHeader className="text-center pb-8 pt-10 space-y-4">
            <CardTitle className="text-4xl font-black text-primary">تسجيل دخول المنظم</CardTitle>
            <CardDescription className="text-lg font-light text-primary arabic-text">
              لتسجيل حضور المشاركين بمسح البطاقات
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-10 sm:px-10">
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-base font-medium mb-2 block text-primary">
                  اسم المستخدم
                </Label>
                <Input
                  id="username"
                  required
                  dir="ltr"
                  autoCapitalize="none"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 border-2 bg-white focus-visible:border-primary rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-base font-medium mb-2 block text-primary">
                  كلمة المرور
                </Label>
                <PasswordInput
                  id="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-2 bg-white focus-visible:border-primary rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-full bg-brand-orange text-lg font-bold text-white hover:bg-brand-orange-dark glow-accent transition-smooth disabled:opacity-50"
                disabled={busy}
              >
                {busy ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PublicPageShell>
  );
}
