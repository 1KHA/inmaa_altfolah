'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { REGISTRATION_CLOSED, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, TEAM_MIN_MEMBERS, TEAM_SIZE_OPTIONS } from '@/lib/constants'
import { uploadFileToSupabase } from '@/lib/supabase-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/../../components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/../../components/ui/use-toast'
import Loader from '@/components/ui/loader'
import { HACKATHON_TRACKS } from '@/lib/tracks'
import PublicPageShell from '@/components/site/PublicPageShell'

interface Participant {
  fullName: string
  contactNumber: string
  email: string
  gender: string
  isUniversityStudent: boolean
  universityMajor: string
  university: string
  professionalField: string
  city: string
  canAttendHackathon: boolean
}

const initialParticipantState: Participant = {
  fullName: '',
  contactNumber: '',
  email: '',
  gender: '',
  isUniversityStudent: false,
  universityMajor: '',
  university: '',
  professionalField: '',
  city: '',
  canAttendHackathon: false,
}

const initialFormState = {
  registrationType: '', // 'individual' or 'team'
  teamName: '',
  hackathonTrack: '',
  ideaDescription: '',
  hearAboutUs: '',
  agreeToTerms: false,
  leaderInfo: initialParticipantState,
  members: Array(TEAM_MIN_MEMBERS - 1).fill(null).map(() => ({ ...initialParticipantState })),
  memberCount: TEAM_MIN_MEMBERS, // total team size, leader included; members[] holds the rest
}

type FormState = typeof initialFormState;

/* Attachment rules — keep in sync with the storage helper's content-type map
   (src/lib/supabase-storage.ts) and the uploads bucket's 25MB limit. */
const ATTACHMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'pptx', 'zip', 'rar', 'jpg', 'jpeg', 'png']
const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(',')

/* Project-acceptance rules shown next to the idea-description field, so
   applicants read them before writing their idea. Display-only. */
// Mirrors "شروط قبول المشاريع" on the home page
// (src/app/_childhood-landing/components/EligibilitySection.tsx) — keep the two in sync.
const IDEA_RULES = [
  'وضوح المشكلة وابتكارية الحل',
  'أصالة الفكرة',
  'الارتباط بالمسار التقني وقابلية التطبيق',
  'ضوابط المشاركة',
]

function IdeaRulesDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8v.01" />
        </svg>
        شروط قبول المشاريع
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" aria-describedby={undefined} className="max-w-[95vw] sm:max-w-xl p-0 overflow-hidden">
          {/* The identity's four colour plates */}
          <div aria-hidden className="flex h-2 w-full">
            <span className="flex-1 bg-brand-navy"></span>
            <span className="flex-1 bg-brand-orange"></span>
            <span className="flex-1 bg-brand-honey"></span>
            <span className="flex-1 bg-brand-green"></span>
          </div>
          <div className="p-5 sm:p-7">
            <DialogHeader className="text-right sm:text-right">
              <DialogTitle className="text-xl sm:text-2xl text-primary font-bold">
                شروط قبول المشاريع
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto pl-1">
              {IDEA_RULES.map((rule, i) => (
                <div key={rule} className="flex items-center gap-3 rounded-xl border-2 border-gray-100 bg-gray-50/60 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="font-semibold text-primary">
                    {rule}
                  </p>
                </div>
              ))}
            </div>

            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full bg-primary hover:bg-primary-dark font-medium"
            >
              فهمت، لنبدأ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function RegisterTeamPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showLoader, setShowLoader] = useState(true)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [contentVisible, setContentVisible] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)

  // Initialize with default state to prevent hydration issues
  const [formState, setFormState] = useState<FormState>(initialFormState)

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

  // Load from localStorage after component mounts
  useEffect(() => {
    setMounted(true)
    try {
      const savedState = localStorage.getItem('registrationForm')
      if (savedState) {
        setFormState(JSON.parse(savedState))
      }
    } catch (error) {
      console.error('Failed to parse form state from localStorage', error)
    }
  }, [])

  // Save to localStorage when form state changes (only after mounted)
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('registrationForm', JSON.stringify(formState))
    }
  }, [formState, mounted])

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (!file) {
      setAttachmentFile(null)
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
      toast({
        title: 'نوع الملف غير مدعوم',
        description: `الأنواع المسموحة: ${ATTACHMENT_EXTENSIONS.join('، ')}`,
        variant: 'destructive',
      })
      e.target.value = ''
      setAttachmentFile(null)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'حجم الملف كبير',
        description: `الحد الأقصى لحجم المرفق ${MAX_FILE_SIZE_MB} ميجابايت`,
        variant: 'destructive',
      })
      e.target.value = ''
      setAttachmentFile(null)
      return
    }
    setAttachmentFile(file)
  }

  const handleStateChange = (field: keyof FormState, value: any) => {
    setFormState((prev: FormState) => ({ ...prev, [field]: value }))
  }

  const handleLeaderChange = (field: keyof Participant, value: string | boolean) => {
    setFormState((prev: FormState) => ({
      ...prev,
      leaderInfo: { ...prev.leaderInfo, [field]: value },
    }))
  }

  const handleMemberChange = (index: number, field: keyof Participant, value: string | boolean) => {
    setFormState((prev: FormState) => {
      const newMembers = [...prev.members]
      newMembers[index] = { ...newMembers[index], [field]: value }
      return { ...prev, members: newMembers }
    })
  }

  const handleMemberCountChange = (value: string) => {
    const count = parseInt(value)
    setFormState((prev: FormState) => {
      const currentMembers = prev.members
      if (count > currentMembers.length) {
        const newMembers = [...currentMembers]
        for (let i = currentMembers.length; i < count - 1; i++) { // count - 1 because leader is separate
          newMembers.push({ ...initialParticipantState })
        }
        return { ...prev, memberCount: count, members: newMembers }
      }
      return { ...prev, memberCount: count, members: currentMembers.slice(0, count - 1) }
    })
  }

  const handleRegistrationTypeChange = (value: string) => {
    setFormState((prev: FormState) => ({
      ...prev,
      registrationType: value,
      teamName: value === 'individual' ? '' : prev.teamName,
      ideaDescription: value === 'individual' ? '' : prev.ideaDescription,
      hearAboutUs: value === 'individual' ? '' : prev.hearAboutUs,
    }))
  }

  // Email validation function
  const isValidEmail = (email: string | undefined) => {
    if (!email) return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Validation function to check if all required fields are filled
  const isFormValid = () => {
    // Check registration type and hackathon track
    if (!formState.registrationType || !formState.hackathonTrack || !formState.agreeToTerms) {
      return false
    }

    // Check team fields if team registration
    if (formState.registrationType === 'team') {
      if (!formState.teamName || !formState.teamName.trim() || 
          !formState.ideaDescription || !formState.ideaDescription.trim() || 
          !formState.hearAboutUs || !formState.hearAboutUs.trim()) {
        return false
      }
    }

    // Check leader info
    const leader = formState.leaderInfo
    if (!leader.fullName || !leader.fullName.trim() || 
        !leader.contactNumber || leader.contactNumber.length !== 10 || 
        !leader.email || !leader.email.trim() || 
        !isValidEmail(leader.email) || 
        !leader.gender || 
        !leader.universityMajor || !leader.universityMajor.trim() || 
        !leader.university || !leader.university.trim() || 
        !leader.professionalField || !leader.professionalField.trim() || 
        !leader.city || !leader.city.trim()) {
      return false
    }

    // Check team members if team registration
    if (formState.registrationType === 'team') {
      for (let i = 0; i < formState.memberCount - 1; i++) {
        const member = formState.members[i]
        if (!member.fullName || !member.fullName.trim() || 
            !member.contactNumber || member.contactNumber.length !== 10 || 
            !member.email || !member.email.trim() || 
            !isValidEmail(member.email) || 
            !member.gender || 
            !member.universityMajor || !member.universityMajor.trim() || 
            !member.university || !member.university.trim() || 
            !member.professionalField || !member.professionalField.trim() || 
            !member.city || !member.city.trim()) {
          return false
        }
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Validate phone numbers are exactly 10 digits
    if (!formState.leaderInfo.contactNumber || formState.leaderInfo.contactNumber.length !== 10) {
      toast({
        title: 'خطأ في رقم التواصل',
        description: 'يجب أن يكون رقم التواصل مكون من 10 أرقام بالضبط',
        variant: 'destructive',
      })
      setIsSubmitting(false)
      return
    }

    // Validate team members' phone numbers if team registration
    if (formState.registrationType === 'team') {
      for (let i = 0; i < formState.memberCount - 1; i++) {
        if (!formState.members[i].contactNumber || formState.members[i].contactNumber.length !== 10) {
          toast({
            title: 'خطأ في رقم التواصل',
            description: `يجب أن يكون رقم التواصل للعضو ${i + 1} مكون من 10 أرقام بالضبط`,
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }
      }
    }

    const formData = new FormData()
    
    // Add registration type and team info
    formData.append('registrationType', formState.registrationType)
    formData.append('isTeamRegistration', formState.registrationType === 'team' ? 'true' : 'false')
    
    // Hackathon track is required for both individual and team
    formData.append('hackathonTrack', formState.hackathonTrack)
    
    if (formState.registrationType === 'team') {
      formData.append('teamName', formState.teamName)
      formData.append('ideaDescription', formState.ideaDescription)
      formData.append('hearAboutUs', formState.hearAboutUs)
      formData.append('memberCount', formState.memberCount.toString())
    }

    // Add participant data
    formData.append('leaderInfo', JSON.stringify(formState.leaderInfo))
    if (formState.registrationType === 'team') {
      formData.append('members', JSON.stringify(formState.members.slice(0, formState.memberCount - 1)))
    }

    // Upload the attachment straight from the browser to Supabase Storage.
    // Sending the file through the API route hits Vercel's request-body limit
    // (FUNCTION_PAYLOAD_TOO_LARGE at ~4.5MB) long before our 25MB rule; this
    // way the function only ever receives the file's URL.
    if (attachmentFile) {
      try {
        const { publicUrl } = await uploadFileToSupabase(attachmentFile, 'teams')
        formData.append('attachmentPath', publicUrl)
      } catch (error) {
        console.error('Attachment upload failed', error)
        toast({
          title: 'خطأ',
          description: 'فشل رفع المرفق، يرجى المحاولة مرة أخرى',
          variant: 'destructive',
        })
        setIsSubmitting(false)
        return
      }
    }

    try {
      const response = await fetch('/api/register-team', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.removeItem('registrationForm')
        setShowCelebration(true)
        // Redirect after 3 seconds
        setTimeout(() => {
          router.push('/')
        }, 3000)
      } else {
        toast({
          title: 'خطأ',
          description: data.error || 'فشل إرسال النموذج',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ أثناء إرسال النموذج',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderParticipantFields = (
    participant: Participant,
    updateFn: (field: keyof Participant, value: string | boolean) => void,
    prefix: string
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <Label htmlFor={`${prefix}-fullName`} className="text-base font-medium mb-2 block text-primary">
          الاسم كاملًا
        </Label>
        <Input 
          id={`${prefix}-fullName`} 
          required 
          value={participant.fullName || ''} 
          onChange={(e) => updateFn('fullName', e.target.value)}
          className={`h-11 border-2 ${participant.fullName && participant.fullName.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-contactNumber`} className="text-base font-medium mb-2 block text-primary">
          رقم التواصل
        </Label>
        <Input 
          id={`${prefix}-contactNumber`} 
          type="tel" 
          required 
          value={participant.contactNumber} 
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
            updateFn('contactNumber', digitsOnly)
          }} 
          dir="ltr"
          className={`h-11 border-2 ${participant.contactNumber && participant.contactNumber.length === 10 ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          placeholder="0501234567"
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-email`} className="text-base font-medium mb-2 block text-primary">
          البريد الإلكتروني
        </Label>
        <Input 
          id={`${prefix}-email`} 
          type="email" 
          required 
          value={participant.email} 
          onChange={(e) => updateFn('email', e.target.value)} 
          dir="ltr"
          className={`h-11 border-2 ${participant.email && participant.email.trim() && isValidEmail(participant.email) ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          placeholder="example@email.com"
        />
      </div>
      <div>
        <Label className="text-base font-medium mb-2 block text-primary">
        جنس المتقدم
        </Label>
        <Select required onValueChange={(value) => updateFn('gender', value)} value={participant.gender}>
          <SelectTrigger className={`h-11 border-2 ${participant.gender ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg text-right`} dir="rtl">
            <SelectValue placeholder="اختر الجنس..." />
          </SelectTrigger>
          <SelectContent className="text-right" dir="rtl">
            <SelectItem value="male" className="text-right">ذكر</SelectItem>
            <SelectItem value="female" className="text-right">أنثى</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Checkbox 
          id={`${prefix}-isUniversityStudent`} 
          checked={participant.isUniversityStudent} 
          onCheckedChange={(checked: boolean | 'indeterminate') => updateFn('isUniversityStudent', !!checked)}
          className="border-primary data-[state=checked]:bg-primary"
        />
        <Label htmlFor={`${prefix}-isUniversityStudent`} className="text-base cursor-pointer text-primary font-medium">
          هل أنت طالب في الجامعة؟
        </Label>
      </div>
      <div>
        <Label htmlFor={`${prefix}-universityMajor`} className="text-base font-medium mb-2 block text-primary">
          اذكر تخصصك الجامعي
        </Label>
        <Input 
          id={`${prefix}-universityMajor`} 
          required 
          value={participant.universityMajor} 
          onChange={(e) => updateFn('universityMajor', e.target.value)}
          className={`h-11 border-2 ${participant.universityMajor && participant.universityMajor.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-university`} className="text-base font-medium mb-2 block text-primary">
          اذكر جامعتك
        </Label>
        <Input 
          id={`${prefix}-university`} 
          required 
          value={participant.university} 
          onChange={(e) => updateFn('university', e.target.value)}
          className={`h-11 border-2 ${participant.university && participant.university.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-professionalField`} className="text-base font-medium mb-2 block text-primary">
          ماهو مجالك المهني؟
        </Label>
        <Input 
          id={`${prefix}-professionalField`} 
          required 
          value={participant.professionalField} 
          onChange={(e) => updateFn('professionalField', e.target.value)}
          className={`h-11 border-2 ${participant.professionalField && participant.professionalField.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-city`} className="text-base font-medium mb-2 block text-primary">
          المدينة
        </Label>
        <Input 
          id={`${prefix}-city`} 
          required 
          value={participant.city} 
          onChange={(e) => updateFn('city', e.target.value)}
          className={`h-11 border-2 ${participant.city && participant.city.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
        />
      </div>
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Checkbox 
          id={`${prefix}-canAttendHackathon`} 
          checked={participant.canAttendHackathon} 
          onCheckedChange={(checked: boolean | 'indeterminate') => updateFn('canAttendHackathon', !!checked)}
          className="border-primary data-[state=checked]:bg-primary"
        />
        <Label htmlFor={`${prefix}-canAttendHackathon`} className="text-base cursor-pointer text-primary font-medium">
          هل تستطيع الحضور في مقر الهاكثون في الخبر؟
        </Label>
      </div>
    </div>
  )

  return (
    <>
      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-12 mx-4 max-w-2xl w-full text-center shadow-2xl animate-in fade-in zoom-in duration-500">
            <div className="text-8xl mb-6">🎉</div>
            <h1 className="text-5xl font-bold mb-6 text-primary">
              تم التسجيل في التحدي بنجاح
            </h1>
            <p className="text-2xl mb-8 text-primary font-medium">
              شكرًا لك على التسجيل! سيتم التواصل معك قريبًا
            </p>
            <div className="flex justify-center space-x-4 text-4xl">
              <span className="animate-bounce">🎊</span>
              <span className="animate-bounce delay-100">✨</span>
              <span className="animate-bounce delay-200">🎉</span>
              <span className="animate-bounce delay-300">🎈</span>
            </div>
          </div>
        </div>
      )}

      {/* Loader with smooth fade out */}
      {showLoader && <Loader isVisible={loaderVisible} />}
      
      {/* Main content with smooth fade in */}
      <div 
        className={`transition-opacity duration-500 ${contentVisible ? 'opacity-100' : 'opacity-0'} ${showCelebration ? 'pointer-events-none' : ''}`}
      >
      {/* Header and footer shared with the home and login pages */}
      <PublicPageShell>
        <div className="max-w-5xl mx-auto">
        <Card className="gradient-card rounded-3xl border-border/60 shadow-elegant">
          <CardHeader className="text-center pb-8 pt-10">
            <CardTitle className="text-4xl font-bold mb-4 text-primary">
              نموذج تسجيل المشاركين
            </CardTitle>
            <CardDescription className="text-xl text-primary">
              {REGISTRATION_CLOSED ? 'انتهى التسجيل في الهاكاثون' : 'سجل للمشاركة في الهاكاثون وكن جزءًا من التغيير'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-10 pb-10">
            {REGISTRATION_CLOSED ? (
              <div className="text-center py-12">
                <h2 className="text-5xl font-bold mb-6 text-primary">
                  انتهى التسجيل
                </h2>
                <p className="text-2xl mb-8 text-primary font-medium">
                  نعتذر، لقد انتهت فترة التسجيل في الهاكاثون
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
              {/* Registration Type Selection */}
              <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200 text-primary">
                  نوع المشاركة
                </h3>
                <div>
                  <Label className="text-lg font-medium mb-4 block text-primary">
                    هل ستشارك كفريق؟
                  </Label>
                  <RadioGroup 
                    required 
                    value={formState.registrationType} 
                    onValueChange={handleRegistrationTypeChange} 
                    className="flex flex-col sm:flex-row gap-6 mt-4"
                  >
                    <div className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-primary transition-colors">
                      <RadioGroupItem value="individual" id="individual" className="border-primary" />
                      <Label htmlFor="individual" className="text-lg cursor-pointer text-primary font-medium">
                        مشاركة فردية
                      </Label>
                    </div>
                    <div className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-primary transition-colors">
                      <RadioGroupItem value="team" id="team" className="border-primary" />
                      <Label htmlFor="team" className="text-lg cursor-pointer text-primary font-medium">
                        مشاركة كفريق
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Hackathon Track Selection - Show for both individual and team */}
              {formState.registrationType && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200 text-primary">
                    مسار الهاكاثون
                  </h3>
                  <div>
                    <Label className="text-lg font-medium mb-4 block text-primary">
                      أي مسار من مسارات الهاكاثون؟
                    </Label>
                    <Select 
                      required 
                      onValueChange={(value) => handleStateChange('hackathonTrack', value)} 
                      value={formState.hackathonTrack}
                    >
                      <SelectTrigger className="h-12 text-lg border-2 border-gray-200 focus:border-primary text-right" dir="rtl">
                        <SelectValue placeholder="اختر المسار..." />
                      </SelectTrigger>
                      <SelectContent className="text-right" dir="rtl">
                        {HACKATHON_TRACKS.map((track) => (
                          <SelectItem key={track} value={track} className="text-lg py-3 text-right">
                            {track}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Team Information - Only show if team registration */}
              {formState.registrationType === 'team' && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200 text-primary">
                    معلومات الفريق
                  </h3>
                  
                  <div>
                    <Label htmlFor="team-name" className="text-base font-medium mb-2 block text-primary">
                      اسم الفريق
                    </Label>
                    <Input 
                      id="team-name" 
                      required 
                      value={formState.teamName} 
                      onChange={(e) => handleStateChange('teamName', e.target.value)}
                      className={`h-11 border-2 ${formState.teamName && formState.teamName.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="idea-description" className="text-base font-medium text-primary">
                        صف الفكرة
                      </Label>
                      <IdeaRulesDialog />
                    </div>
                    <Textarea
                      id="idea-description" 
                      required 
                      value={formState.ideaDescription} 
                      onChange={(e) => handleStateChange('ideaDescription', e.target.value)} 
                      rows={4}
                      className={`border-2 ${formState.ideaDescription && formState.ideaDescription.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg resize-none`}
                    />
                  </div>

                  <div>
                    <Label htmlFor="hear-about-us" className="text-base font-medium mb-2 block text-primary">
                      من أين سمعت عنا
                    </Label>
                    <Input 
                      id="hear-about-us" 
                      required 
                      value={formState.hearAboutUs || ''} 
                      onChange={(e) => handleStateChange('hearAboutUs', e.target.value)}
                      className={`h-11 border-2 ${formState.hearAboutUs && formState.hearAboutUs.trim() ? 'border-gray-200 focus:border-primary' : 'border-red-300 focus:border-red-500'} rounded-lg`}
                    />
                  </div>

                  <div>
                    <Label htmlFor="member-count" className="text-base font-medium mb-2 block text-primary">
                      عدد أعضاء الفريق (شامل القائد)
                    </Label>
                    <Select value={String(formState.memberCount)} onValueChange={handleMemberCountChange}>
                      <SelectTrigger className="h-11 border-2 border-gray-200 focus:border-primary rounded-lg text-right" dir="rtl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-right" dir="rtl">
                        {TEAM_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)} className="text-right">{n} أعضاء</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="attachments-file" className="text-base font-medium mb-2 block text-primary">
                      إضافة مرفقات (اختياري)
                    </Label>
                    <Input
                      id="attachments-file"
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      onChange={handleAttachmentChange}
                      className="h-11 border-2 border-gray-200 focus:border-primary rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary-dark"
                    />
                    <p className="text-sm mt-2 text-primary">
                      ارفاق المتوفر من شعار، ملف تعريفي، الخ. (بحد أقصى {MAX_FILE_SIZE_MB} ميجابايت — PDF, Word, PowerPoint, ZIP, صور)
                    </p>
                  </div>
                </div>
              )}

              {/* Participant Information */}
              {formState.registrationType && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200 text-primary">
                    {formState.registrationType === 'team' ? 'معلومات قائد الفريق' : 'معلوماتك الشخصية'}
                  </h3>
                  {renderParticipantFields(formState.leaderInfo, handleLeaderChange, 'leader')}
                </div>
              )}

              {/* Team Members Information - Only show if team registration */}
              {formState.registrationType === 'team' && formState.memberCount > 1 && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200 text-primary">
                    معلومات أعضاء الفريق
                  </h3>
                  {formState.members.slice(0, formState.memberCount - 1).map((member: Participant, index: number) => (
                    <div key={index} className="bg-white p-6 border-2 border-gray-200 rounded-xl space-y-4 shadow-sm">
                      <h4 className="font-bold text-xl mb-4 text-primary">
                        العضو {index + 1}
                      </h4>
                      {renderParticipantFields(member, (field, value) => handleMemberChange(index, field, value), `member-${index}`)}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100">
                <div className="flex items-center gap-3">
                  <Checkbox 
                    id="terms" 
                    required 
                    checked={formState.agreeToTerms} 
                    onCheckedChange={(checked) => handleStateChange('agreeToTerms', !!checked)}
                    className="border-primary data-[state=checked]:bg-primary"
                  />
                  <Label htmlFor="terms" className="text-lg cursor-pointer text-primary font-medium">
                    أوافق على الشروط والأحكام
                  </Label>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-full bg-brand-orange text-xl font-bold text-white hover:bg-brand-orange-dark glow-accent transition-smooth disabled:opacity-50" 
                disabled={isSubmitting || !isFormValid()}
              >
                {isSubmitting ? 'جاري الإرسال...' : 'إرسال التسجيل'}
              </Button>
              </form>
            )}
          </CardContent>
        </Card>
        </div>
      </PublicPageShell>
      </div>
    </>
  )
}
