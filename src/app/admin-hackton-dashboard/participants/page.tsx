"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Download, Trash, Edit, Eye, Check, X, UserPlus, Ban, RotateCcw } from "lucide-react";
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "../../../../components/ui/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { usePhases, PhaseBadge, PhaseBulkActions, PhaseRowMove, PhaseFilter, matchesPhaseFilter } from "@/components/phases/phase-controls";

// Define types for our data
interface IndividualParticipant {
  id: string;
  email: string;
  status: string; // pending, approved, rejected
  isDisabled?: boolean;
  teamId: null;
  // New CSV fields
  fullName?: string;
  contactNumber?: string;
  gender?: string;
  isUniversityStudent?: boolean;
  university?: string;
  universityMajor?: string;
  professionalField?: string;
  city?: string;
  canAttendHackathon?: boolean;
  // Legacy fields
  firstName?: string;
  secondName?: string;
  familyName?: string;
  nationalId?: string;
  dob?: string;
  phoneNumber?: string;
  education?: string;
  major?: string;
  employmentStatus?: string;
  nationality?: string;
  residence?: string;
  canAttend?: boolean;
  createdAt: string;
  // Phase membership. These rows are individuals (teamId is null), so the
  // participant's own phase IS their phase — no team to read through.
  phaseId?: string | null;
  phaseStatus?: string | null;
  phase?: { id: string; name: string; order: number; isDisabled: boolean } | null;
}

export default function ParticipantsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [individualParticipants, setIndividualParticipants] = useState<IndividualParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // State for modals
  const [selectedParticipant, setSelectedParticipant] = useState<IndividualParticipant | null>(null);
  // Bulk disable/enable selection (ids of rows ticked in the table)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { phases } = usePhases();
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // State for new participant form
  const [newParticipant, setNewParticipant] = useState({
    fullName: '',
    email: '',
    contactNumber: '',
    gender: '',
    isUniversityStudent: false,
    university: '',
    universityMajor: '',
    professionalField: '',
    city: '',
    canAttendHackathon: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchIndividualParticipants = async (search?: string) => {
    try {
      setLoading(true);
      const url = search 
        ? `/api/admin/participants?email=${encodeURIComponent(search)}` 
        : '/api/admin/participants';
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch individual participants');
      }
      const participants: IndividualParticipant[] = await response.json();
      setIndividualParticipants(participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndividualParticipants();
  }, []);

  const handleApproveParticipant = async (participantId: string) => {
    try {
      const response = await fetch('/api/admin/approve-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ participantId }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "نجح",
          description: `تمت الموافقة على المشارك وإنشاء الحساب بنجاح${result.generatedPassword ? ` - كلمة المرور: ${result.generatedPassword}` : ''}`,
        });
        fetchIndividualParticipants(); // Refresh the list
      } else {
        const data = await response.json();
        toast({
          title: "خطأ",
          description: data.error || "فشل في الموافقة على المشارك",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء الموافقة على المشارك",
        variant: "destructive",
      });
    }
  };

  const handleRejectParticipant = async (participantId: string) => {
    try {
      const response = await fetch('/api/admin/reject-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ participantId }),
      });

      if (response.ok) {
        toast({
          title: "نجح",
          description: "تم رفض المشارك بنجاح",
        });
        fetchIndividualParticipants(); // Refresh the list
      } else {
        const data = await response.json();
        toast({
          title: "خطأ",
          description: data.error || "فشل في رفض المشارك",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء رفض المشارك",
        variant: "destructive",
      });
    }
  };

  const handleDeleteParticipant = async (participantId: string) => {
    try {
      const response = await fetch('/api/admin/delete-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ participantId }),
      });

      if (response.ok) {
        toast({
          title: "نجح",
          description: "تم حذف المشارك بنجاح",
        });
        fetchIndividualParticipants(); // Refresh the list
        setIsDeleteModalOpen(false);
      } else {
        toast({
          title: "خطأ",
          description: "فشل في حذف المشارك",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف المشارك",
        variant: "destructive",
      });
    }
  };

  // Handle creating a new participant
  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!newParticipant.email || !newParticipant.fullName) {
      toast({
        title: "خطأ",
        description: "يرجى ملء الحقول المطلوبة (الاسم والبريد الإلكتروني)",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/admin/create-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newParticipant),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "نجح",
          description: "تم إنشاء المشارك بنجاح",
        });
        
        // Reset form and close modal
        setNewParticipant({
          fullName: '',
          email: '',
          contactNumber: '',
          gender: '',
          isUniversityStudent: false,
          university: '',
          universityMajor: '',
          professionalField: '',
          city: '',
          canAttendHackathon: false
        });
        
        setIsCreateModalOpen(false);
        fetchIndividualParticipants(); // Refresh the list
      } else {
        toast({
          title: "خطأ",
          description: data.error || "فشل في إنشاء المشارك",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إنشاء المشارك",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Disable or re-enable every ticked participant in one request. */
  const handleBulkDisable = async (disabled: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      setBulkBusy(true);
      const res = await fetch('/api/admin/accounts/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ participantIds: Array.from(selectedIds), disabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تنفيذ العملية');
      toast({
        title: 'نجح',
        description: disabled
          ? `تم تعطيل ${data.participantsUpdated} حساب`
          : `تم تفعيل ${data.participantsUpdated} حساب`,
      });
      setSelectedIds(new Set());
      fetchIndividualParticipants(searchQuery);
    } catch (err) {
      toast({
        title: 'خطأ',
        description: err instanceof Error ? err.message : 'فشل تنفيذ العملية',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  // Filter participants based on search query and selected status
  const filteredParticipants = individualParticipants
    .filter(participant => selectedStatus === "all" || participant.status === selectedStatus)
    .filter(participant => matchesPhaseFilter(participant, phaseFilter))
    .filter(participant => {
      const displayName = participant.fullName || `${participant.firstName || ''} ${participant.secondName || ''} ${participant.familyName || ''}`.trim();
      return displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
             participant.email.toLowerCase().includes(searchQuery.toLowerCase());
    });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">معتمد</span>;
      case 'pending':
        return <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">قيد المراجعة</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">مرفوض</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getDisplayName = (participant: IndividualParticipant) => {
    return participant.fullName || `${participant.firstName || ''} ${participant.secondName || ''} ${participant.familyName || ''}`.trim() || 'غير متوفر';
  };

  // Function to handle exporting participants data to Excel
  const handleExportToExcel = () => {
    try {
      // Create a worksheet with participants data
      const worksheet = XLSX.utils.json_to_sheet(
        individualParticipants.map(participant => ({
          'الاسم الكامل': getDisplayName(participant),
          'البريد الإلكتروني': participant.email,
          'رقم التواصل': participant.contactNumber || participant.phoneNumber || '',
          'الجنس': participant.gender || '',
          'الجامعة': participant.university || '',
          'التخصص': participant.universityMajor || participant.major || '',
          'المجال المهني': participant.professionalField || participant.employmentStatus || '',
          'المدينة': participant.city || participant.residence || '',
          'طالب جامعي؟': participant.isUniversityStudent !== undefined ? (participant.isUniversityStudent ? 'نعم' : 'لا') : '',
          'يمكنه الحضور؟': participant.canAttendHackathon !== undefined ? (participant.canAttendHackathon ? 'نعم' : 'لا') : 
                          (participant.canAttend !== undefined ? (participant.canAttend ? 'نعم' : 'لا') : ''),
          'رقم الهوية': participant.nationalId || '',
          'تاريخ الميلاد': participant.dob || '',
          'الجنسية': participant.nationality || '',
          'المؤهل التعليمي': participant.education || '',
          'الحالة': participant.status === "approved" ? "معتمد" : 
                   participant.status === "rejected" ? "مرفوض" : "قيد المراجعة",
          'تاريخ التسجيل': new Date(participant.createdAt).toLocaleDateString('ar-SA'),
        }))
      );

      // Create a workbook and add the worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "المشاركون الأفراد");

      // Generate Excel file and trigger download
      XLSX.writeFile(workbook, "بيانات_المشاركين_الأفراد.xlsx");

      toast({
        title: "نجح",
        description: "تم تصدير بيانات المشاركين الأفراد بنجاح",
      });
    } catch (error) {
      console.error('Error exporting participants:', error);
      toast({
        title: "خطأ",
        description: "فشل في تصدير بيانات المشاركين الأفراد",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">المشاركون الأفراد</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <UserPlus className="ml-2 h-4 w-4" />
          إضافة مشارك جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المشاركين الأفراد</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row justify-between mb-6 gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="بحث عن مشارك، بريد إلكتروني، جامعة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    fetchIndividualParticipants(searchQuery);
                  }
                }}
                className="w-full md:w-64 py-2 pr-10 pl-4 rounded-md border border-input bg-background text-right"
              />
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute left-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => fetchIndividualParticipants(searchQuery)}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-right"
              >
                <option value="all">جميع الحالات</option>
                <option value="pending">قيد المراجعة</option>
                <option value="approved">معتمد</option>
                <option value="rejected">مرفوض</option>
              </select>
              <PhaseFilter value={phaseFilter} onChange={setPhaseFilter} phases={phases} />
              <Button variant="outline" className="gap-2" onClick={handleExportToExcel}>
                <Download className="h-4 w-4" />
                تصدير
              </Button>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <span className="text-sm font-medium">تم اختيار {selectedIds.size} مشارك</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkBusy}
                onClick={() => handleBulkDisable(true)}
              >
                <Ban className="ml-1 h-4 w-4" />
                تعطيل المحدد
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => handleBulkDisable(false)}
              >
                <RotateCcw className="ml-1 h-4 w-4" />
                إعادة التفعيل
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                إلغاء التحديد
              </Button>
              <PhaseBulkActions
                ids={Array.from(selectedIds)}
                kind="participant"
                phases={phases}
                onDone={() => { setSelectedIds(new Set()); fetchIndividualParticipants(searchQuery); }}
              />
            </div>
          )}

          {loading ? (
            <p className="text-center p-4">جاري تحميل البيانات...</p>
          ) : error ? (
            <p className="text-center p-4 text-red-500">{error}</p>
          ) : filteredParticipants.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 w-10 text-center">
                      <Checkbox
                        aria-label="تحديد الكل"
                        checked={
                          filteredParticipants.length > 0 &&
                          filteredParticipants.every((p) => selectedIds.has(p.id))
                        }
                        onCheckedChange={(checked) =>
                          setSelectedIds(
                            checked === true
                              ? new Set(filteredParticipants.map((p) => p.id))
                              : new Set()
                          )
                        }
                      />
                    </th>
                    <th className="border p-2 text-right">الاسم</th>
                    <th className="border p-2 text-right">البريد الإلكتروني</th>
                    <th className="border p-2 text-right">الجامعة</th>
                    <th className="border p-2 text-right">التخصص</th>
                    <th className="border p-2 text-right">المدينة</th>
                    <th className="border p-2 text-right">الحالة</th>
                    <th className="border p-2 text-right">المرحلة</th>
                    <th className="border p-2 text-right">تاريخ التسجيل</th>
                    <th className="border p-2 text-right">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((participant) => (
                    <tr
                      key={participant.id}
                      className={`hover:bg-muted/50 ${participant.isDisabled ? 'bg-red-50/60' : ''}`}
                    >
                      <td className="border p-2 text-center">
                        <Checkbox
                          aria-label="تحديد المشارك"
                          checked={selectedIds.has(participant.id)}
                          onCheckedChange={() => toggleRow(participant.id)}
                        />
                      </td>
                      <td className="border p-2">
                        {getDisplayName(participant)}
                        {participant.isDisabled && (
                          <span className="mr-2 px-1.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                            معطل
                          </span>
                        )}
                      </td>
                      <td className="border p-2">{participant.email}</td>
                      <td className="border p-2">{participant.university || 'غير متوفر'}</td>
                      <td className="border p-2">{participant.universityMajor || participant.major || 'غير متوفر'}</td>
                      <td className="border p-2">{participant.city || participant.residence || 'غير متوفر'}</td>
                      <td className="border p-2">{getStatusBadge(participant.status)}</td>
                      <td className="border p-2">
                        <div className="flex items-center gap-1">
                          <PhaseBadge phase={participant.phase} phaseStatus={participant.phaseStatus} />
                          {phases.length > 0 && (
                            <PhaseRowMove
                              id={participant.id}
                              kind="participant"
                              disabled={!participant.phaseId}
                              onDone={() => fetchIndividualParticipants(searchQuery)}
                            />
                          )}
                        </div>
                      </td>
                      <td className="border p-2">
                        {new Date(participant.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="border p-2">
                        <div className="flex gap-2 justify-center">
                          <button
                            className="p-1 rounded-md hover:bg-muted"
                            title="عرض التفاصيل"
                            onClick={() => {
                              setSelectedParticipant(participant);
                              setIsViewModalOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {participant.status === "pending" && (
                            <>
                              <button 
                                className="p-1 rounded-md hover:bg-muted text-green-600"
                                title="الموافقة على المشارك"
                                onClick={() => handleApproveParticipant(participant.id)}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button 
                                className="p-1 rounded-md hover:bg-muted text-red-600"
                                title="رفض المشارك"
                                onClick={() => handleRejectParticipant(participant.id)}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            className={`p-1 rounded-md hover:bg-muted ${participant.isDisabled ? 'text-green-600' : 'text-amber-600'}`}
                            title={participant.isDisabled ? 'إعادة تفعيل الحساب' : 'تعطيل الحساب'}
                            onClick={async () => {
                              setSelectedIds(new Set([participant.id]));
                              await handleBulkDisable(!participant.isDisabled);
                            }}
                          >
                            {participant.isDisabled ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                          </button>
                          <button
                            className="p-1 rounded-md hover:bg-muted text-red-500"
                            title="حذف"
                            onClick={() => {
                              setSelectedParticipant(participant);
                              setIsDeleteModalOpen(true);
                            }}
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center p-4">لا يوجد مشاركون أفراد لعرضهم.</p>
          )}

          <div className="mt-4 text-sm text-muted-foreground text-center">
            إجمالي المشاركين الأفراد: {individualParticipants.length} | المعروضين: {filteredParticipants.length}
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>إحصائيات المشاركين الأفراد</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-muted p-4 rounded-lg text-center">
              <h3 className="text-2xl font-bold">{individualParticipants.length}</h3>
              <p className="text-muted-foreground">إجمالي المشاركين الأفراد</p>
            </div>
            <div className="bg-muted p-4 rounded-lg text-center">
              <h3 className="text-2xl font-bold">
                {individualParticipants.filter((p) => p.status === "approved").length}
              </h3>
              <p className="text-muted-foreground">المعتمدين</p>
            </div>
            <div className="bg-muted p-4 rounded-lg text-center">
              <h3 className="text-2xl font-bold">
                {individualParticipants.filter((p) => p.status === "pending").length}
              </h3>
              <p className="text-muted-foreground">قيد المراجعة</p>
            </div>
            <div className="bg-muted p-4 rounded-lg text-center">
              <h3 className="text-2xl font-bold">
                {individualParticipants.filter((p) => p.status === "rejected").length}
              </h3>
              <p className="text-muted-foreground">المرفوضين</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Participant Details Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل المشارك: {selectedParticipant && getDisplayName(selectedParticipant)}</DialogTitle>
          </DialogHeader>
          {selectedParticipant && (
            <div className="space-y-4 p-4 max-h-[70vh] overflow-y-auto text-right">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <p><strong>الاسم:</strong> {getDisplayName(selectedParticipant)}</p>
                <p><strong>البريد الإلكتروني:</strong> {selectedParticipant.email}</p>
                <p><strong>رقم التواصل:</strong> {selectedParticipant.contactNumber || selectedParticipant.phoneNumber || 'غير متوفر'}</p>
                <p><strong>الجنس:</strong> {selectedParticipant.gender || 'غير متوفر'}</p>
                <p><strong>الجامعة:</strong> {selectedParticipant.university || 'غير متوفر'}</p>
                <p><strong>التخصص:</strong> {selectedParticipant.universityMajor || selectedParticipant.major || 'غير متوفر'}</p>
                <p><strong>المجال المهني:</strong> {selectedParticipant.professionalField || selectedParticipant.employmentStatus || 'غير متوفر'}</p>
                <p><strong>المدينة:</strong> {selectedParticipant.city || selectedParticipant.residence || 'غير متوفر'}</p>
                <p><strong>طالب جامعي؟</strong> {selectedParticipant.isUniversityStudent !== undefined ? (selectedParticipant.isUniversityStudent ? 'نعم' : 'لا') : 'غير متوفر'}</p>
                <p><strong>يمكنه الحضور؟</strong> {selectedParticipant.canAttendHackathon !== undefined ? (selectedParticipant.canAttendHackathon ? 'نعم' : 'لا') : (selectedParticipant.canAttend !== undefined ? (selectedParticipant.canAttend ? 'نعم' : 'لا') : 'غير متوفر')}</p>
                <p><strong>الحالة:</strong> {getStatusBadge(selectedParticipant.status)}</p>
                <p><strong>تاريخ التسجيل:</strong> {new Date(selectedParticipant.createdAt).toLocaleDateString('ar-SA')}</p>
                {selectedParticipant.nationalId && <p><strong>رقم الهوية:</strong> {selectedParticipant.nationalId}</p>}
                {selectedParticipant.dob && <p><strong>تاريخ الميلاد:</strong> {selectedParticipant.dob}</p>}
                {selectedParticipant.nationality && <p><strong>الجنسية:</strong> {selectedParticipant.nationality}</p>}
                {selectedParticipant.education && <p><strong>المؤهل التعليمي:</strong> {selectedParticipant.education}</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsViewModalOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Participant Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد أنك تريد حذف المشارك "{selectedParticipant && getDisplayName(selectedParticipant)}"؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => selectedParticipant && handleDeleteParticipant(selectedParticipant.id)}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Participant Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إضافة مشارك جديد</DialogTitle>
            <DialogDescription>
              أدخل بيانات المشارك الجديد. سيتم إنشاء المشارك بحالة "قيد المراجعة" وسيحتاج للموافقة.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateParticipant} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName">الاسم الكامل <span className="text-red-500">*</span></Label>
                <Input
                  id="fullName"
                  value={newParticipant.fullName}
                  onChange={(e) => setNewParticipant({...newParticipant, fullName: e.target.value})}
                  placeholder="الاسم الكامل"
                  required
                  className="text-right"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={newParticipant.email}
                  onChange={(e) => setNewParticipant({...newParticipant, email: e.target.value})}
                  placeholder="example@example.com"
                  required
                  className="text-right"
                />
              </div>

              {/* Contact Number */}
              <div className="space-y-2">
                <Label htmlFor="contactNumber">رقم التواصل</Label>
                <Input
                  id="contactNumber"
                  value={newParticipant.contactNumber}
                  onChange={(e) => setNewParticipant({...newParticipant, contactNumber: e.target.value})}
                  placeholder="05xxxxxxxx"
                  className="text-right"
                />
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label htmlFor="gender">الجنس</Label>
                <select
                  id="gender"
                  value={newParticipant.gender}
                  onChange={(e) => setNewParticipant({...newParticipant, gender: e.target.value})}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-right"
                >
                  <option value="">اختر الجنس</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>

              {/* University */}
              <div className="space-y-2">
                <Label htmlFor="university">الجامعة</Label>
                <Input
                  id="university"
                  value={newParticipant.university}
                  onChange={(e) => setNewParticipant({...newParticipant, university: e.target.value})}
                  placeholder="اسم الجامعة"
                  className="text-right"
                />
              </div>

              {/* University Major */}
              <div className="space-y-2">
                <Label htmlFor="universityMajor">التخصص الجامعي</Label>
                <Input
                  id="universityMajor"
                  value={newParticipant.universityMajor}
                  onChange={(e) => setNewParticipant({...newParticipant, universityMajor: e.target.value})}
                  placeholder="التخصص"
                  className="text-right"
                />
              </div>

              {/* Professional Field */}
              <div className="space-y-2">
                <Label htmlFor="professionalField">المجال المهني</Label>
                <Input
                  id="professionalField"
                  value={newParticipant.professionalField}
                  onChange={(e) => setNewParticipant({...newParticipant, professionalField: e.target.value})}
                  placeholder="المجال المهني"
                  className="text-right"
                />
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city">المدينة</Label>
                <Input
                  id="city"
                  value={newParticipant.city}
                  onChange={(e) => setNewParticipant({...newParticipant, city: e.target.value})}
                  placeholder="المدينة"
                  className="text-right"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isUniversityStudent"
                  checked={newParticipant.isUniversityStudent}
                  onCheckedChange={(checked: boolean | 'indeterminate') => 
                    setNewParticipant({...newParticipant, isUniversityStudent: checked === true})
                  }
                />
                <Label htmlFor="isUniversityStudent">طالب جامعي</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="canAttendHackathon"
                  checked={newParticipant.canAttendHackathon}
                  onCheckedChange={(checked: boolean | 'indeterminate') => 
                    setNewParticipant({...newParticipant, canAttendHackathon: checked === true})
                  }
                />
                <Label htmlFor="canAttendHackathon">يمكنه الحضور للهاكاثون</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء المشارك'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
