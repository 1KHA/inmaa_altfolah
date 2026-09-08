'use client'

/**
 * Admin "create team" form.
 *
 * Posts to the SAME endpoint as the public registration page
 * (`POST /api/register-team`), so this form must send exactly what that route
 * reads. It previously collected the old pre-2026 schema
 * (firstName/secondName/familyName/nationalId/dob/…, challenge, ideaName,
 * ideaSolution, ideaResults, ideaStage, hasParticipated…) and never sent
 * `hackathonTrack` or `isTeamRegistration`, so every submission failed with
 * 400 "Hackathon track selection is required." — admin team creation was
 * entirely broken.
 *
 * Fields the API actually persists (see src/app/api/register-team/route.ts):
 *   team        : teamName, hackathonTrack, ideaDescription, hearAboutUs, attachment
 *   participant : fullName, contactNumber, email, gender, isUniversityStudent,
 *                 universityMajor, university, professionalField, city,
 *                 canAttendHackathon
 * Everything else it hardcodes, so anything not in that list is dropped here
 * rather than collected and silently discarded.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHALLENGES } from '@/lib/challenges'
import { Checkbox } from '@/../../components/ui/checkbox'
import { useToast } from '@/../../components/ui/use-toast'
import { prepareUpload, validateUploadFile, UPLOAD_ACCEPT, UPLOAD_HINT } from '@/lib/client-upload'

/** Mirrors the participant shape the API reads. */
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
  teamName: '',
  hackathonTrack: '',
  ideaDescription: '',
  hearAboutUs: '',
  leaderInfo: { ...initialParticipantState },
  // members EXCLUDES the leader. memberCount is the TOTAL team size, matching
  // the public form; the API accepts 2 or 3 total (1–2 members + leader).
  members: [{ ...initialParticipantState }],
  memberCount: 2,
}

type FormState = typeof initialFormState

/** Same options the public registration form offers. */
const PROFESSIONAL_FIELDS = ['ذكاء اصناعي', 'علم البيانات', 'برمجة']

export default function AdminCreateTeamPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [formState, setFormState] = useState<FormState>(initialFormState)

  const handleStateChange = (field: keyof Omit<FormState, 'leaderInfo' | 'members'>, value: any) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const handleLeaderChange = (field: keyof Participant, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, leaderInfo: { ...prev.leaderInfo, [field]: value } }))
  }

  const handleMemberChange = (index: number, field: keyof Participant, value: string | boolean) => {
    setFormState((prev) => {
      const newMembers = [...prev.members]
      newMembers[index] = { ...newMembers[index], [field]: value }
      return { ...prev, members: newMembers }
    })
  }

  /** value = TOTAL team size (leader + members). */
  const handleMemberCountChange = (value: string) => {
    const total = parseInt(value, 10)
    const needed = total - 1
    setFormState((prev) => {
      const members = [...prev.members]
      while (members.length < needed) members.push({ ...initialParticipantState })
      return { ...prev, memberCount: total, members: members.slice(0, needed) }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Mirrors the public form's payload — the API requires registrationType,
    // isTeamRegistration and hackathonTrack.
    const formData = new FormData()
    formData.append('registrationType', 'team')
    formData.append('isTeamRegistration', 'true')
    formData.append('teamName', formState.teamName)
    formData.append('hackathonTrack', formState.hackathonTrack)
    formData.append('ideaDescription', formState.ideaDescription)
    formData.append('hearAboutUs', formState.hearAboutUs)
    formData.append('memberCount', String(formState.memberCount))
    formData.append('leaderInfo', JSON.stringify(formState.leaderInfo))
    formData.append('members', JSON.stringify(formState.members.slice(0, formState.memberCount - 1)))
    if (attachmentFile) {
      // Direct-to-storage upload; the API gets only the URL (function bodies
      // are capped at ~4.5 MB by Vercel — see src/lib/client-upload.ts).
      const outcome = await prepareUpload(attachmentFile, 'teams')
      if (outcome.mode === 'error') {
        toast({ title: 'خطأ في المرفق', description: outcome.message, variant: 'destructive' })
        setIsSubmitting(false)
        return
      }
      if (outcome.mode === 'direct') formData.append('attachmentPath', outcome.publicUrl)
      else formData.append('attachment', attachmentFile)
    }

    try {
      const response = await fetch('/api/register-team', { method: 'POST', body: formData })
      const data = await response.json()

      if (response.ok) {
        toast({ title: 'نجح!', description: 'تم إنشاء الفريق بنجاح' })
        router.push('/admin-hackton-dashboard/teams')
      } else {
        toast({
          title: 'خطأ',
          description: data.error || 'فشل إنشاء الفريق',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ أثناء إنشاء الفريق',
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor={`${prefix}-fullName`}>الاسم كاملًا</Label>
        <Input id={`${prefix}-fullName`} required value={participant.fullName} onChange={(e) => updateFn('fullName', e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-email`}>البريد الإلكتروني</Label>
        <Input id={`${prefix}-email`} type="email" required value={participant.email} onChange={(e) => updateFn('email', e.target.value)} dir="ltr" />
      </div>
      <div>
        <Label htmlFor={`${prefix}-contactNumber`}>رقم التواصل</Label>
        <Input
          id={`${prefix}-contactNumber`}
          type="tel"
          required
          value={participant.contactNumber}
          onChange={(e) => updateFn('contactNumber', e.target.value.replace(/\D/g, ''))}
          dir="ltr"
        />
      </div>
      <div>
        <Label>جنس المتقدم</Label>
        <Select required onValueChange={(value) => updateFn('gender', value)} value={participant.gender}>
          <SelectTrigger><SelectValue placeholder="اختر الجنس..." /></SelectTrigger>
          <SelectContent className="text-right" dir="rtl">
            <SelectItem value="ذكر" className="text-right">ذكر</SelectItem>
            <SelectItem value="أنثى" className="text-right">أنثى</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${prefix}-university`}>اذكر جامعتك</Label>
        <Input id={`${prefix}-university`} required value={participant.university} onChange={(e) => updateFn('university', e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-universityMajor`}>اذكر تخصصك الجامعي</Label>
        <Input id={`${prefix}-universityMajor`} required value={participant.universityMajor} onChange={(e) => updateFn('universityMajor', e.target.value)} />
      </div>
      <div>
        <Label>ماهو مجالك المهني؟</Label>
        <Select required onValueChange={(value) => updateFn('professionalField', value)} value={participant.professionalField}>
          <SelectTrigger><SelectValue placeholder="اختر مجالك المهني..." /></SelectTrigger>
          <SelectContent className="text-right" dir="rtl">
            {PROFESSIONAL_FIELDS.map((f) => (
              <SelectItem key={f} value={f} className="text-right">{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        {/* Stored in Participant.city — the public form labels this column the
            same way, so keep them consistent. */}
        <Label htmlFor={`${prefix}-city`}>أدخل رابط الGithub</Label>
        <Input id={`${prefix}-city`} required value={participant.city} onChange={(e) => updateFn('city', e.target.value)} dir="ltr" />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${prefix}-isUniversityStudent`}
          checked={participant.isUniversityStudent}
          onCheckedChange={(checked: boolean | 'indeterminate') => updateFn('isUniversityStudent', !!checked)}
        />
        <Label htmlFor={`${prefix}-isUniversityStudent`} className="cursor-pointer">هل أنت طالب في الجامعة؟</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${prefix}-canAttendHackathon`}
          checked={participant.canAttendHackathon}
          onCheckedChange={(checked: boolean | 'indeterminate') => updateFn('canAttendHackathon', !!checked)}
        />
        <Label htmlFor={`${prefix}-canAttendHackathon`} className="cursor-pointer">
          هل تستطيع التواجد خلال فترة التحدي في مقر - وادي مكة؟
        </Label>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>إنشاء فريق جديد (للأدمن)</CardTitle>
            <CardDescription>أدخل بيانات الفريق والمشاركين</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Team Leader */}
              <div className="space-y-4">
                <h3 className="text-xl font-semibold border-b pb-2">معلومات قائد الفريق</h3>
                {renderParticipantFields(formState.leaderInfo, handleLeaderChange, 'leader')}
              </div>

              {/* Team + idea */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold border-b pb-2">معلومات الفريق والفكرة</h3>

                <div>
                  <Label htmlFor="team-name">اسم الفريق</Label>
                  <Input id="team-name" required value={formState.teamName} onChange={(e) => handleStateChange('teamName', e.target.value)} />
                </div>

                <div>
                  <Label>أي مسار من مسارات التحدي</Label>
                  <Select required onValueChange={(value) => handleStateChange('hackathonTrack', value)} value={formState.hackathonTrack}>
                    <SelectTrigger><SelectValue placeholder="اختر المسار..." /></SelectTrigger>
                    <SelectContent className="text-right" dir="rtl">
                      {CHALLENGES.map((challenge) => (
                        <SelectItem key={challenge} value={challenge} className="text-right">
                          {challenge}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="idea-description">صف الفكرة</Label>
                  <Textarea id="idea-description" required rows={4} value={formState.ideaDescription} onChange={(e) => handleStateChange('ideaDescription', e.target.value)} />
                </div>

                <div>
                  <Label htmlFor="hear-about-us">من أين سمعت عنا</Label>
                  <Input id="hear-about-us" value={formState.hearAboutUs} onChange={(e) => handleStateChange('hearAboutUs', e.target.value)} />
                </div>

                <div>
                  <Label htmlFor="attachments-file">إضافة مرفقات</Label>
                  <Input
                    id="attachments-file"
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    onChange={(e) => {
                      const file = e.target.files ? e.target.files[0] : null
                      if (file) {
                        const problem = validateUploadFile(file)
                        if (problem) {
                          toast({ title: 'ملف غير مقبول', description: problem, variant: 'destructive' })
                          e.target.value = ''
                          setAttachmentFile(null)
                          return
                        }
                      }
                      setAttachmentFile(file)
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{UPLOAD_HINT}</p>
                </div>
              </div>

              {/* Team size — the API accepts 2 or 3 members in total */}
              <div>
                <Label htmlFor="member-count">عدد أعضاء الفريق (شاملاً القائد)</Label>
                <Select value={String(formState.memberCount)} onValueChange={handleMemberCountChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="text-right" dir="rtl">
                    <SelectItem value="2" className="text-right">2 أعضاء</SelectItem>
                    <SelectItem value="3" className="text-right">3 أعضاء</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Members (excluding the leader) */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold border-b pb-2">معلومات أعضاء الفريق</h3>
                {formState.members.slice(0, formState.memberCount - 1).map((member: Participant, index: number) => (
                  <div key={index} className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-medium text-lg">العضو {index + 1}</h4>
                    {renderParticipantFields(member, (field, value) => handleMemberChange(index, field, value), `member-${index}`)}
                  </div>
                ))}
              </div>

              <Button type="submit" className="w-full text-lg py-3" disabled={isSubmitting}>
                {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء الفريق'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
