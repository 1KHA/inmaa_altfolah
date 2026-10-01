"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Progress } from "../../../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Edit, Save, X, User, Book, Phone, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "../../../components/ui/use-toast";

// Define type for our data
interface Participant {
  id: string;
  email: string;
  status: string;
  teamId?: string;
  isLeader: boolean;
  
  // Name fields
  firstName?: string;
  secondName?: string;
  familyName?: string;
  fullName?: string;
  
  // Contact information
  phoneNumber?: string;
  contactNumber?: string;
  
  // Personal information
  nationalId?: string;
  dob?: string;
  gender?: string;
  nationality?: string;
  residence?: string;
  city?: string;
  
  // Education information
  education?: string;
  university?: string;
  major?: string;
  universityMajor?: string;
  employmentStatus?: string;
  professionalField?: string;
  
  // Boolean fields
  canAttend?: boolean;
  canAttendHackathon?: boolean;
  isUniversityStudent?: boolean;
  
  // Team information
  team?: {
    id: string;
    teamName: string;
    status: string;
  };
  
  // Virtual fields (not in database schema)
  role?: string; // This is a virtual field, not stored in the database
}

const educationOptions = [
  "ثانوية عامة",
  "دبلوم",
  "بكالوريوس",
  "ماجستير",
  "دكتوراه"
];

const employmentOptions = [
  "طالب",
  "موظف",
  "باحث عن عمل",
  "متقاعد",
  "أخرى"
];

export default function ParticipantDashboardPage() {
  const [participantData, setParticipantData] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedParticipant, setEditedParticipant] = useState<Participant | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const fetchParticipantDetails = async () => {
    try {
      setLoading(true);
      setProgress(30);
      const response = await fetch('/api/participant/me');
      setProgress(60);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch your details');
      }
      const data: Participant = await response.json();
      setParticipantData(data);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipantDetails();
  }, []);

  const handleUpdateParticipant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editedParticipant) return;

    try {
      const response = await fetch('/api/participant/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedParticipant),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update participant');
      }
      
      toast({
        title: "تم التحديث بنجاح",
        description: "تم حفظ بياناتك بنجاح"
      });
      
      fetchParticipantDetails();
      setIsEditing(false);
    } catch (error) {
      toast({
        title: "خطأ في التحديث",
        description: (error as Error).message,
        variant: "destructive"
      });
    }
  };

  const startEditing = () => {
    setEditedParticipant(participantData);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditedParticipant(null);
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        <Progress value={progress} className="w-full h-2" />
        <p className="text-center text-muted-foreground">جاري تحميل بياناتك...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!participantData) {
    return (
      <Alert className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>لم يتم العثور على بياناتك.</AlertDescription>
      </Alert>
    );
  }

  const participant = isEditing ? editedParticipant! : participantData;

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">ملفي الشخصي</h1>
          <p className="text-muted-foreground">مرحباً بك {participant.fullName}</p>
        </div>
        {!isEditing ? (
          <Button onClick={startEditing} className="w-full sm:w-auto">
            <Edit className="ml-2 h-4 w-4" />
            تعديل بياناتي
          </Button>
        ) : (
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={cancelEditing} className="flex-1 sm:flex-none">
              <X className="ml-2 h-4 w-4" />
              إلغاء
            </Button>
            <Button onClick={(e) => handleUpdateParticipant(e as any)} className="bg-[#12795a] hover:bg-[#0f6b4f] flex-1 sm:flex-none">
              <Save className="ml-2 h-4 w-4" />
              حفظ التغييرات
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-8">
              <TabsTrigger value="contact" className="text-xs sm:text-sm">
                <Phone className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">معلومات التواصل</span>
                <span className="xs:hidden">التواصل</span>
              </TabsTrigger>
              <TabsTrigger value="academic" className="text-xs sm:text-sm">
                <Book className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">معلومات أكاديمية</span>
                <span className="xs:hidden">أكاديمية</span>
              </TabsTrigger>
              <TabsTrigger value="personal" className="text-xs sm:text-sm">
                <User className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">معلومات شخصية</span>
                <span className="xs:hidden">شخصية</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">الاسم الأول</Label>
                  <Input
                    id="firstName"
                    value={participant.firstName || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, firstName: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondName">الاسم الثاني</Label>
                  <Input
                    id="secondName"
                    value={participant.secondName || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, secondName: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="familyName">اسم العائلة</Label>
                  <Input
                    id="familyName"
                    value={participant.familyName || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, familyName: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nationalId">رقم الهوية</Label>
                  <Input
                    id="nationalId"
                    value={participant.nationalId || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, nationalId: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nationality">الجنسية</Label>
                  <Input
                    id="nationality"
                    value={participant.nationality || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, nationality: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="residence">منطقة الإقامة</Label>
                  <Input
                    id="residence"
                    value={participant.residence || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, residence: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Badge variant={participant.canAttend ? "default" : "secondary"}>
                  {participant.canAttend ? "يمكنه الحضور" : "لا يمكنه الحضور"}
                </Badge>
                <Badge variant={participant.isLeader ? "default" : "secondary"}>
                  {participant.isLeader ? "قائد الفريق" : "عضو فريق"}
                </Badge>
              </div>
            </TabsContent>

            <TabsContent value="academic" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="education">المؤهل التعليمي</Label>
                  {isEditing ? (
                    <Select
                      value={participant.education || ''}
                      onValueChange={(value) => setEditedParticipant({ ...editedParticipant!, education: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المؤهل التعليمي" />
                      </SelectTrigger>
                      <SelectContent>
                        {educationOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={participant.education || ''} disabled className="text-right" />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="university">الجامعة</Label>
                  <Input
                    id="university"
                    value={participant.university || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, university: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="major">التخصص</Label>
                  <Input
                    id="major"
                    value={participant.major || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, major: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employmentStatus">الحالة الوظيفية</Label>
                  {isEditing ? (
                    <Select
                      value={participant.employmentStatus || ''}
                      onValueChange={(value) => setEditedParticipant({ ...editedParticipant!, employmentStatus: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الحالة الوظيفية" />
                      </SelectTrigger>
                      <SelectContent>
                        {employmentOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={participant.employmentStatus || ''} disabled className="text-right" />
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contact" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    value={participant.email}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, email: e.target.value })}
                    disabled={!isEditing}
                    className="text-right"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">رقم الجوال</Label>
                  <Input
                    id="phoneNumber"
                    value={participant.phoneNumber || ''}
                    onChange={(e) => isEditing && setEditedParticipant({ ...editedParticipant!, phoneNumber: e.target.value })}
                    disabled={!isEditing}
                    dir="ltr"
                    className="text-right"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
