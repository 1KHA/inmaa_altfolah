'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '../../../components/ui/use-toast'
import { useAuth } from '@/contexts/auth-context'
import Link from 'next/link'
import Loader from '@/components/ui/loader'
import SiteHeader from '@/app/landing/components/SiteHeader'
import SiteFooter from '@/app/landing/components/SiteFooter'

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { login, user, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  /* Persistent inline error — a toast disappears after a few seconds and is easy
     to miss on a failed login attempt. */
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [showLoader, setShowLoader] = useState(true)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [contentVisible, setContentVisible] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (authLoading) return;
    
    if (user) {
      console.log('✅ User already logged in:', user.role);
      
      // Redirect based on user role
      if (user.role === 'participant') {
        router.push('/participant-dashboard');
      } else if (user.role === 'mentor') {
        router.push('/mentor-dashboard');
      } else if (user.role === 'admin') {
        router.push('/admin-hackton-dashboard');
      }
    }
  }, [user, authLoading, router])
  
  // Loader timer effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaderVisible(false);
      // Start content fade in after loader starts fading out
      setTimeout(() => {
        setShowLoader(false);
        setContentVisible(true);
      }, 300); // Wait for loader fade out to complete
    }, 1500); // 1.5 seconds

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLoading(true)

    try {
      // login() returns { success, error } — not a boolean. Reading it as one
      // made every attempt look successful, including a wrong password.
      const result = await login(formData.email, formData.password)

      if (result.success) {
        toast({
          title: "نجح",
          description: "تم تسجيل الدخول بنجاح!",
        });
        
        // The auth context will update the user state
        // The useEffect above will handle the redirect based on user role
      } else {
        setErrorMessage(result.error || "بيانات الدخول غير صحيحة")
      }
    } catch (error) {
      console.error('Login error:', error)
      setErrorMessage("حدث خطأ أثناء تسجيل الدخول")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Loader with smooth fade out */}
      {showLoader && <Loader isVisible={loaderVisible} />}
      
      {/* Main content with smooth fade in */}
      <div 
        className={`min-h-screen flex flex-col transition-opacity duration-500 ${contentVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: '#620F10', fontFamily: 'Somar-Medium, Arial, sans-serif' }}
      >
        {/* Header (shared with the landing and registration pages) */}
        <SiteHeader standalone />
        
        {/* Form Section — flex-1 keeps the footer at the bottom on tall screens */}
        <div className="flex-1 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto">
            <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader className="text-center pb-8 pt-10">
                <CardTitle className="text-4xl font-bold mb-4" style={{ color: '#620F10', fontFamily: 'Somar-Bold, Arial, sans-serif' }}>
                  تسجيل الدخول
                </CardTitle>
                <CardDescription className="text-xl" style={{ color: '#620F10', fontFamily: 'Somar-Light, Arial, sans-serif' }}>
                  أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى لوحة التحكم
                </CardDescription>
              </CardHeader>
              <CardContent className="px-10 pb-10">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {errorMessage && (
                    <div
                      role="alert"
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      style={{ fontFamily: 'Somar-Light, Arial, sans-serif' }}
                    >
                      {errorMessage}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-base font-medium mb-2 block" style={{ color: '#620F10', fontFamily: 'Somar-Medium, Arial, sans-serif' }}>
                      البريد الإلكتروني
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@email.com"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      dir="ltr"
                      className="h-11 border-2 border-gray-200 focus:border-[#620F10] rounded-lg"
                      style={{ fontFamily: 'Somar-Light, Arial, sans-serif' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="password" className="text-base font-medium block" style={{ color: '#620F10', fontFamily: 'Somar-Medium, Arial, sans-serif' }}>
                        كلمة المرور
                      </Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs font-medium hover:underline"
                        style={{ color: '#620F10', fontFamily: 'Somar-Light, Arial, sans-serif' }}
                      >
                        نسيت كلمة المرور؟
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="أدخل كلمة المرور"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      dir="ltr"
                      className="h-11 border-2 border-gray-200 focus:border-[#620F10] rounded-lg"
                      style={{ fontFamily: 'Somar-Light, Arial, sans-serif' }}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full text-xl py-4 font-bold rounded-xl transition-all duration-300 hover:shadow-lg disabled:opacity-50" 
                    style={{ 
                      backgroundColor: '#620F10', 
                      fontFamily: 'Somar-Bold, Arial, sans-serif',
                      border: 'none'
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
                  </Button>
                </form>
                
                <div className="mt-8 text-center space-y-2">
                  <p className="text-base" style={{ color: '#620F10', fontFamily: 'Somar-Medium, Arial, sans-serif' }}>
                    ليس لديك حساب؟
                  </p>
                  <Link 
                    href="/register-team" 
                    className="text-base hover:underline" 
                    style={{ color: '#620F10', fontFamily: 'Somar-Bold, Arial, sans-serif' }}
                  >
                    سجل فريقك
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Footer (shared with the landing and registration pages) */}
        <SiteFooter standalone />
      </div>
    </>
  )
}
