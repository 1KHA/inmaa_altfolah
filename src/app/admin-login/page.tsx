'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '../../../components/ui/use-toast'
import { useAuth } from '@/contexts/auth-context'

export default function AdminLoginPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, checkAuth } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  /* Persistent inline error: AdminToaster is only mounted inside the dashboard
     layout, so a toast fired from this page had nothing to render it. */
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })

  // Redirect if already logged in as admin
  useEffect(() => {
    const verifyAdminStatus = async () => {
      if (authLoading) return;
      
      try {
        // Directly check admin status with the API
        const response = await fetch('/api/admin/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        
        console.log('🔍 Admin login page - Admin check response status:', response.status);
        
        // If admin check is successful, redirect to dashboard
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.role === 'admin') {
            console.log('✅ Admin already logged in, redirecting to dashboard');
            router.push('/admin-hackton-dashboard');
            return;
          }
        }
        
        // If user is logged in but not as admin
        if (user && user.role !== 'admin') {
          console.log(`⚠️ User logged in with role: ${user.role}, but not admin`);
          setErrorMessage(`أنت مسجل دخول كـ ${user.role}. يرجى تسجيل الخروج أولاً للدخول كمسؤول.`);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };
    
    verifyAdminStatus();
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLoading(true)

    console.log('🔐 Admin login attempt:', { username: formData.username });

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
        credentials: 'include', // Include cookies
      })

      const data = await response.json()

      console.log('📡 Admin login response:', { 
        status: response.status, 
        success: data.success,
        hasUser: !!data.user 
      });

      if (response.ok && data.success) {
        toast({
          title: "نجح",
          description: "تم تسجيل الدخول كمسؤول بنجاح!",
        });

        console.log('✅ Admin login successful, checking auth and redirecting...');
        
        // Refresh auth context to get updated user data
        await checkAuth();
        
        // Redirect to admin dashboard
        router.push('/admin-hackton-dashboard');
      } else {
        console.log('❌ Admin login failed:', data.error);
        setErrorMessage(data.error || "فشل تسجيل الدخول")
      }
    } catch (error) {
      console.error('❌ Admin login error:', error);
      setErrorMessage("حدث خطأ أثناء تسجيل الدخول")
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while checking auth — but not while this page's own submit is
  // running, or the form (and its error) would vanish mid-attempt.
  if (authLoading && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري التحقق من حالة تسجيل الدخول...</p>
        </div>
      </div>
    );
  }

  // Don't show login form if user is already logged in (will redirect)
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري إعادة التوجيه...</p>
        </div>
      </div>
    );
  }

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
            تسجيل دخول المسؤول
          </CardTitle>
          <CardDescription className="text-center">
            أدخل اسم المستخدم وكلمة المرور للوصول إلى لوحة تحكم المسؤول
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              dir="rtl"
            >
              {errorMessage}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin1"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                dir="ltr"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
