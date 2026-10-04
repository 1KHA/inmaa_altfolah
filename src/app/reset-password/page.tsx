'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (password !== confirm) {
      setErrorMessage('كلمتا المرور غير متطابقتين')
      return
    }
    if (password.length < 8) {
      setErrorMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await response.json()

      if (response.ok && data.success) {
        setDone(true)
        setTimeout(() => router.push('/login'), 2500)
      } else {
        setErrorMessage(data.error || 'حدث خطأ. حاول مرة أخرى.')
      }
    } catch {
      setErrorMessage('حدث خطأ أثناء إعادة التعيين')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">
          رابط إعادة التعيين غير صالح. اطلب رابطاً جديداً من صفحة &quot;نسيت كلمة المرور&quot;.
        </p>
        <Button asChild variant="outline">
          <Link href="/forgot-password">طلب رابط جديد</Link>
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="text-sm text-muted-foreground">
          تم تغيير كلمة المرور بنجاح. جاري تحويلك لصفحة تسجيل الدخول...
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور الجديدة</Label>
        <PasswordInput
          id="password"
          placeholder="********"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
        <PasswordInput
          id="confirm"
          placeholder="********"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          dir="ltr"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-hero py-12 px-4 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6">
        <Image
          src="/brand/logo-vertical.svg"
          alt="هاكثون الطفولة"
          width={547}
          height={1018}
          priority
          unoptimized
          className="h-32 w-auto"
        />
      </Link>
      <Card className="w-full max-w-md gradient-card rounded-3xl border-border/60 shadow-elegant">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center text-primary">
            إعادة تعيين كلمة المرور
          </CardTitle>
          <CardDescription className="text-center">
            أدخل كلمة المرور الجديدة لحسابك
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams requires a Suspense boundary in the app router */}
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
