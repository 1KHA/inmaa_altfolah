"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash, Edit, Plus, Loader2, Save } from "lucide-react";
import { useAuthErrorHandler } from "@/hooks/useAuthErrorHandler";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "../../../../components/ui/use-toast";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { TEAM_MAX_MEMBERS } from "@/lib/constants";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Progress } from "../../../../components/ui/progress";
import { Textarea } from "../../../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";

// Define types for our data
interface Participant {
  id: string;
  firstName: string;
  secondName: string;
  familyName: string;
  nationalId: string;
  dob: string;
  email: string;
  phoneNumber: string;
  education: string;
  university: string;
  major: string;
  employmentStatus: string;
  nationality: string;
  residence: string;
  canAttend: boolean;
  isLeader: boolean;
  fullName?: string;
}

interface TeamData {
  id: string;
  teamName: string;
  ideaName: string;
  status: string;
  challenge: string;
  ideaDescription: string;
  challengeReason: string;
  ideaSolution: string;
  ideaResults: string;
  ideaStage: string;
  hasParticipated: boolean;
  participationDetails: string | null;
  attachmentPath: string | null;
  participants: Participant[];
  currentUser: {
    id: string;
    isLeader: boolean;
  };
}

const initialParticipantState: Omit<Participant, 'id' | 'isLeader' | 'fullName'> = {
  firstName: '', secondName: '', familyName: '', nationalId: '', dob: '',
  email: '', phoneNumber: '', education: '', university: '', major: '',
  employmentStatus: '', nationality: '', residence: '', canAttend: false,
};

const fieldLabels: { [key in keyof typeof initialParticipantState]: string } = {
    firstName: 'الاسم الأول', secondName: 'الاسم الثاني', familyName: 'اسم العائلة',
    nationalId: 'رقم الهوية', dob: 'تاريخ الميلاد', email: 'البريد الإلكتروني',
    phoneNumber: 'رقم الهاتف', education: 'المؤهل التعليمي', university: 'الجامعة',
    major: 'التخصص', employmentStatus: 'الحالة الوظيفية', nationality: 'الجنسية',
    residence: 'منطقة الإقامة', canAttend: 'يمكنه الحضور؟',
};

export default function TeamManagementPage() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // State for modals
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTeamEditModalOpen, setIsTeamEditModalOpen] = useState(false);
  // Admin-controlled window for adding members (fetched once; the server
  // enforces it again on submit)
  const [addWindow, setAddWindow] = useState<{
    allowed: boolean;
    message?: string;
    memberAddEnd?: string | null;
  } | null>(null);
  const [editedParticipant, setEditedParticipant] = useState<Participant | null>(null);
  const [newParticipant, setNewParticipant] = useState(initialParticipantState);
  const [editedTeam, setEditedTeam] = useState<Partial<TeamData> | null>(null);
  const { checkAndHandleAuthError } = useAuthErrorHandler();

  const fetchTeamDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/participant/team-details');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch team details');
      }
      const data: TeamData = await response.json();
      setTeamData(data);
    } catch (err) {
      // Check if it's an authentication error and handle it
      const handled = await checkAndHandleAuthError(err);
      if (!handled) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamDetails();
    fetch('/api/participant/member-add-window')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAddWindow(d))
      .catch(() => {});
  }, []);

  const handleDeleteParticipant = async (participantId: string) => {
    try {
      const response = await fetch('/api/participant/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      if (response.ok) {
        toast({ title: "نجح", description: "تم إزالة العضو من الفريق بنجاح" });
        fetchTeamDetails();
        setIsDeleteModalOpen(false);
      } else {
        const errorData = await response.json();
        // Check if it's an authentication error
        const authError = await checkAndHandleAuthError(response);
        if (!authError) {
          toast({ title: "خطأ", description: errorData.error || "فشل إزالة العضو", variant: "destructive" });
        }
      }
    } catch (error) {
      // Check if it's an authentication error
      const handled = await checkAndHandleAuthError(error);
      if (!handled) {
        toast({ title: "خطأ", description: "حدث خطأ أثناء إزالة العضو", variant: "destructive" });
      }
    }
  };

  const handleUpdateParticipant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editedParticipant) return;
    try {
      const response = await fetch('/api/admin/update-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedParticipant),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update participant');
      }
      toast({ title: "تم التحديث بنجاح", description: "تم حفظ تغييرات المشارك." });
      fetchTeamDetails();
      setIsEditModalOpen(false);
    } catch (error) {
      // Check if it's an authentication error
      const handled = await checkAndHandleAuthError(error);
      if (!handled) {
        toast({ title: "خطأ في التحديث", description: (error as Error).message, variant: "destructive" });
      }
    }
  };

  const handleUpdateTeam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editedTeam) return;
    try {
      const response = await fetch('/api/participant/update-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedTeam),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update team');
      }
      toast({ title: "تم التحديث بنجاح", description: "تم حفظ تغييرات الفريق." });
      fetchTeamDetails();
      setIsTeamEditModalOpen(false);
    } catch (error) {
      // Check if it's an authentication error
      const handled = await checkAndHandleAuthError(error);
      if (!handled) {
        toast({ title: "خطأ في التحديث", description: (error as Error).message, variant: "destructive" });
      }
    }
  };

  const openAddMemberDialog = () => {
    if (addWindow && !addWindow.allowed) {
      toast({
        title: "غير مسموح",
        description: addWindow.message || 'انتهى الوقت المسموح ولا يمكن إضافة أعضاء للفريق بعد الآن.',
        variant: "destructive",
      });
      return;
    }
    if (teamData && teamData.participants.length >= TEAM_MAX_MEMBERS) {
      toast({
        title: "غير مسموح",
        description: `وصل الفريق إلى الحد الأقصى لعدد الأعضاء (${TEAM_MAX_MEMBERS} عضواً).`,
        variant: "destructive",
      });
      return;
    }
    setIsAddModalOpen(true);
  };

  const handleAddParticipant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
        const response = await fetch('/api/participant/add-member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newParticipant),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add member');
        }
        toast({ title: "تمت الإضافة بنجاح", description: "تمت إضافة العضو الجديد للفريق، وسيصله بريد إلكتروني ببيانات الدخول إلى حسابه." });
        fetchTeamDetails();
        setIsAddModalOpen(false);
        setNewParticipant(initialParticipantState);
    } catch (error) {
        // Check if it's an authentication error
        const handled = await checkAndHandleAuthError(error);
        if (!handled) {
            toast({ title: "خطأ في الإضافة", description: (error as Error).message, variant: "destructive" });
        }
    }
  };

  if (loading) return (
    <div className="space-y-4 p-4 sm:p-8 text-center">
      <Progress value={40} className="w-full max-w-xl mx-auto" />
      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p>جاري تحميل بيانات الفريق...</p>
      </div>
    </div>
  );

  if (error) return (
    <Alert variant="destructive" className="mx-auto max-w-2xl m-2 sm:m-4">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  if (!teamData) return (
    <Alert className="mx-auto max-w-2xl m-2 sm:m-4">
      <AlertDescription>لم يتم العثور على بيانات الفريق.</AlertDescription>
    </Alert>
  );

  const { currentUser } = teamData;

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-0 sm:p-2 md:p-4" dir="rtl">
      <Tabs defaultValue="team-info" className="w-full">
        <TabsList className="grid w-full h-auto grid-cols-2 p-1">
          <TabsTrigger value="team-info" className="whitespace-normal py-2 text-xs sm:text-sm">معلومات الفريق</TabsTrigger>
          <TabsTrigger value="members" className="whitespace-normal py-2 text-xs sm:text-sm">الأعضاء</TabsTrigger>
        </TabsList>

        <TabsContent value="team-info" className="mt-6">
          <Card>
        <CardHeader className="flex flex-col sm:flex-row-reverse items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xl sm:text-2xl leading-snug break-words">فريق: {teamData.teamName}</CardTitle>
            <CardDescription>تفاصيل الفريق والفكرة</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:shrink-0">
            {currentUser.isLeader && (
              <Button 
                onClick={() => {
                  setEditedTeam({
                    teamName: teamData.teamName,
                    ideaName: teamData.ideaName,
                    challenge: teamData.challenge,
                    ideaDescription: teamData.ideaDescription,
                    challengeReason: teamData.challengeReason,
                    ideaSolution: teamData.ideaSolution,
                    ideaResults: teamData.ideaResults,
                    ideaStage: teamData.ideaStage,
                    hasParticipated: teamData.hasParticipated,
                    participationDetails: teamData.participationDetails || '',
                  });
                  setIsTeamEditModalOpen(true);
                }}
                className="w-full sm:w-auto"
              >
                <Edit className="ml-2 h-4 w-4" />
                تعديل معلومات الفريق
              </Button>
            )}
            {currentUser.isLeader && (
              <Button onClick={openAddMemberDialog} className="w-full sm:w-auto">
                <Plus className="ml-2 h-4 w-4" />
                إضافة عضو
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
            <div className="space-y-4 sm:space-y-6 text-right">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3 sm:p-4 border rounded-lg bg-muted/10 min-w-0 [&>div]:min-w-0">
                    <div className="space-y-2">
                        <Label>اسم الفكرة</Label>
                        <p className="font-medium break-words">{teamData.ideaName}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>التحدي</Label>
                        <p className="font-medium break-words">{teamData.challenge}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>مرحلة الفكرة</Label>
                        <p className="font-medium break-words">{teamData.ideaStage}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>حالة الفريق</Label>
                        <p className="font-medium break-words">{teamData.status}</p>
                    </div>
                </div>

                <div className="space-y-4 p-3 sm:p-4 border rounded-lg bg-muted/10">
                    <div className="space-y-2">
                        <Label>وصف الفكرة</Label>
                        <p className="font-medium leading-relaxed break-words whitespace-pre-wrap">{teamData.ideaDescription}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>سبب اختيار التحدي</Label>
                        <p className="font-medium leading-relaxed break-words whitespace-pre-wrap">{teamData.challengeReason}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>الحل المقترح</Label>
                        <p className="font-medium leading-relaxed break-words whitespace-pre-wrap">{teamData.ideaSolution}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>النتائج المتوقعة</Label>
                        <p className="font-medium leading-relaxed break-words whitespace-pre-wrap">{teamData.ideaResults}</p>
                    </div>
                </div>

                <div className="p-3 sm:p-4 border rounded-lg bg-muted/10">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label>هل شاركت الفكرة من قبل؟</Label>
                            <span className="font-medium">{teamData.hasParticipated ? 'نعم' : 'لا'}</span>
                        </div>
                        {teamData.hasParticipated && (
                            <div className="space-y-2">
                                <Label>تفاصيل المشاركة السابقة</Label>
                                <p className="font-medium break-words">{teamData.participationDetails}</p>
                            </div>
                        )}
                        {teamData.attachmentPath && (
                            <div className="space-y-2">
                                <Label>المرفقات</Label>
                                <div>
                                    <Button variant="link" asChild className="p-0 h-auto font-medium">
                                        <a href={teamData.attachmentPath} target="_blank" rel="noopener noreferrer">
                                            عرض المرفق
                                        </a>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <Card>
        <CardHeader className="flex flex-col sm:flex-row-reverse items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>أعضاء الفريق <span className="text-sm font-normal text-muted-foreground">({teamData.participants.length}/{TEAM_MAX_MEMBERS})</span></CardTitle>
            {addWindow?.allowed && addWindow.memberAddEnd && (
              <p className="text-xs text-muted-foreground mt-1">
                إضافة الأعضاء متاحة حتى {new Date(addWindow.memberAddEnd).toLocaleString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {addWindow && !addWindow.allowed && (
              <p className="text-xs text-red-600 mt-1">{addWindow.message}</p>
            )}
          </div>
          {currentUser.isLeader && (
            <Button onClick={openAddMemberDialog} className="w-full sm:w-auto shrink-0">
              <Plus className="ml-2 h-4 w-4" />
              إضافة عضو
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-2 sm:p-6">
          {/* Card view: phones, tablets and small laptops (below xl) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 xl:hidden">
            {teamData.participants.map((participant) => {
              const canDelete = currentUser.isLeader && currentUser.id !== participant.id;
              
              return (
                <Card key={participant.id} className="overflow-hidden min-w-0">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg leading-snug break-words">{participant.fullName}</h3>
                        <p className="text-sm text-muted-foreground break-all">{participant.email}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {participant.isLeader && (
                          <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 whitespace-nowrap">قائد</span>
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${participant.canAttend ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {participant.canAttend ? 'يمكنه الحضور' : 'لا يمكنه الحضور'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm break-words [&>div]:min-w-0">
                      <div>
                        <span className="text-muted-foreground">رقم الهوية:</span>
                        <p>{participant.nationalId}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">رقم الهاتف:</span>
                        <p>{participant.phoneNumber}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">الجنسية:</span>
                        <p>{participant.nationality}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">الإقامة:</span>
                        <p>{participant.residence}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">المؤهل:</span>
                        <p>{participant.education}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">التخصص:</span>
                        <p>{participant.major}</p>
                      </div>
                    </div>
                    
                    {canDelete && (
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedParticipant(participant);
                            setIsDeleteModalOpen(true);
                          }}
                          className="text-xs"
                        >
                          <Trash className="h-3 w-3 mr-1" />
                          إزالة العضو
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          
          {/* Table view: wide desktops only (xl and up) */}
          <div className="hidden xl:block w-full overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">الاسم الكامل</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">البريد الإلكتروني</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">رقم الهوية</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">تاريخ الميلاد</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">رقم الهاتف</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">المؤهل</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">الجامعة</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">التخصص</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">الحالة الوظيفية</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">الجنسية</th>
                  <th className="p-2 sm:p-4 text-right font-medium text-muted-foreground whitespace-nowrap">الإقامة</th>
                  <th className="p-2 sm:p-4 text-center font-medium text-muted-foreground whitespace-nowrap">يمكنه الحضور</th>
                  <th className="p-2 sm:p-4 text-center font-medium text-muted-foreground whitespace-nowrap">قائد</th>
                  <th className="p-2 sm:p-4 text-center font-medium text-muted-foreground whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {teamData.participants.map((participant) => {
                  const canEdit = currentUser.isLeader;
                  const canDelete = currentUser.isLeader && currentUser.id !== participant.id;

                  return (
                    <tr key={participant.id} className="border-t hover:bg-muted/10 transition-colors">
                      <td className="p-2 sm:p-4 text-right">{participant.fullName}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.email}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.nationalId}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.dob}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.phoneNumber}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.education}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.university}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.major}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.employmentStatus}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.nationality}</td>
                      <td className="p-2 sm:p-4 text-right">{participant.residence}</td>
                      <td className="p-2 sm:p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs ${participant.canAttend ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {participant.canAttend ? 'نعم' : 'لا'}
                        </span>
                      </td>
                      <td className="p-2 sm:p-4 text-center">
                        {participant.isLeader && (
                          <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">قائد</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-4">
                        <div className="flex gap-2 justify-center">
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="حذف"
                              onClick={() => {
                                setSelectedParticipant(participant);
                                setIsDeleteModalOpen(true);
                              }}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Participant Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl">
          <DialogHeader><DialogTitle>تعديل المشارك: {selectedParticipant?.fullName}</DialogTitle></DialogHeader>
          {editedParticipant && (
            <form onSubmit={handleUpdateParticipant}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 text-right max-h-[70vh] overflow-y-auto p-2 sm:p-4">
                {Object.keys(fieldLabels).map((key) => {
                    const fieldKey = key as keyof typeof initialParticipantState;
                    if (fieldKey === 'canAttend') return null;
                    return (
                        <div key={key}>
                            <Label htmlFor={key}>{fieldLabels[fieldKey]}</Label>
                            <Input id={key} value={editedParticipant[fieldKey] as string} onChange={(e) => setEditedParticipant({ ...editedParticipant, [key]: e.target.value })} className="w-full p-2 border rounded-md mt-1" />
                        </div>
                    )
                })}
                <div className="flex items-center space-x-2">
                    <Checkbox id="canAttend-edit" checked={editedParticipant.canAttend} onCheckedChange={(checked: boolean) => setEditedParticipant({ ...editedParticipant, canAttend: checked })} />
                    <Label htmlFor="canAttend-edit">{fieldLabels.canAttend}</Label>
                </div>
              </div>
              <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
                <Button type="submit" className="w-full sm:w-auto">حفظ التغييرات</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Participant Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
              <DialogTitle className="text-xl font-semibold">تأكيد إزالة العضو</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                هل أنت متأكد أنك تريد إزالة العضو "{selectedParticipant?.fullName}" من الفريق؟
              </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedParticipant && handleDeleteParticipant(selectedParticipant.id)}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              إزالة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Add Member Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">إضافة عضو جديد</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              أدخل معلومات العضو الجديد في الفريق
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddParticipant}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 max-h-[70vh] overflow-y-auto px-4">
              {Object.keys(fieldLabels).map((key) => {
                const fieldKey = key as keyof typeof initialParticipantState;
                if (fieldKey === 'canAttend') return null;
                return (
                    <div key={key}>
                        <Label htmlFor={`add-${key}`}>{fieldLabels[fieldKey]}</Label>
                        <Input id={`add-${key}`} value={newParticipant[fieldKey] as string} onChange={(e) => setNewParticipant({ ...newParticipant, [key]: e.target.value })} className="w-full p-2 border rounded-md mt-1" required />
                    </div>
                )
              })}
              <div className="flex items-center space-x-2">
                <Checkbox id="canAttend-add" checked={newParticipant.canAttend} onCheckedChange={(checked: boolean) => setNewParticipant({ ...newParticipant, canAttend: checked })} />
                <Label htmlFor="canAttend-add">{fieldLabels.canAttend}</Label>
              </div>
            </div>
            <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
              <Button type="submit" className="w-full sm:w-auto">إضافة العضو</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Team Edit Modal */}
      <Dialog open={isTeamEditModalOpen} onOpenChange={setIsTeamEditModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">تعديل معلومات الفريق</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              قم بتعديل معلومات الفريق والفكرة
            </DialogDescription>
          </DialogHeader>
          {editedTeam && (
            <form onSubmit={handleUpdateTeam}>
              <div className="grid grid-cols-1 gap-6 py-4 max-h-[70vh] overflow-y-auto px-4">
                {/* Team Basic Information */}
                <div className="space-y-4 border p-4 rounded-lg">
                  <h3 className="font-semibold text-lg">معلومات الفريق الأساسية</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="teamName">اسم الفريق</Label>
                    <Input 
                      id="teamName" 
                      value={editedTeam.teamName || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, teamName: e.target.value })}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ideaName">اسم الفكرة</Label>
                    <Input 
                      id="ideaName" 
                      value={editedTeam.ideaName || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, ideaName: e.target.value })}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="challenge">التحدي</Label>
                    <Input 
                      id="challenge" 
                      value={editedTeam.challenge || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, challenge: e.target.value })}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ideaStage">مرحلة الفكرة</Label>
                    <Select 
                      value={editedTeam.ideaStage || ''} 
                      onValueChange={(value) => setEditedTeam({ ...editedTeam, ideaStage: value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="اختر مرحلة الفكرة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="فكرة">فكرة</SelectItem>
                        <SelectItem value="نموذج أولي">نموذج أولي</SelectItem>
                        <SelectItem value="منتج">منتج</SelectItem>
                        <SelectItem value="شركة ناشئة">شركة ناشئة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Idea Details */}
                <div className="space-y-4 border p-4 rounded-lg">
                  <h3 className="font-semibold text-lg">تفاصيل الفكرة</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="ideaDescription">وصف الفكرة</Label>
                    <Textarea 
                      id="ideaDescription" 
                      value={editedTeam.ideaDescription || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, ideaDescription: e.target.value })}
                      className="w-full min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="challengeReason">سبب اختيار التحدي</Label>
                    <Textarea 
                      id="challengeReason" 
                      value={editedTeam.challengeReason || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, challengeReason: e.target.value })}
                      className="w-full min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ideaSolution">الحل المقترح</Label>
                    <Textarea 
                      id="ideaSolution" 
                      value={editedTeam.ideaSolution || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, ideaSolution: e.target.value })}
                      className="w-full min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ideaResults">النتائج المتوقعة</Label>
                    <Textarea 
                      id="ideaResults" 
                      value={editedTeam.ideaResults || ''} 
                      onChange={(e) => setEditedTeam({ ...editedTeam, ideaResults: e.target.value })}
                      className="w-full min-h-[100px]"
                    />
                  </div>
                </div>

                {/* Additional Information */}
                <div className="space-y-4 border p-4 rounded-lg">
                  <h3 className="font-semibold text-lg">معلومات إضافية</h3>
                  
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox 
                      id="hasParticipated" 
                      checked={editedTeam.hasParticipated} 
                      onCheckedChange={(checked: boolean) => setEditedTeam({ ...editedTeam, hasParticipated: checked })}
                    />
                    <Label htmlFor="hasParticipated">هل شاركت الفكرة من قبل؟</Label>
                  </div>

                  {editedTeam.hasParticipated && (
                    <div className="space-y-2">
                      <Label htmlFor="participationDetails">تفاصيل المشاركة السابقة</Label>
                      <Textarea 
                        id="participationDetails" 
                        value={editedTeam.participationDetails || ''} 
                        onChange={(e) => setEditedTeam({ ...editedTeam, participationDetails: e.target.value })}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="mt-6 flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => setIsTeamEditModalOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
                <Button type="submit" className="w-full sm:w-auto">
                  <Save className="ml-2 h-4 w-4" />
                  حفظ التغييرات
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
