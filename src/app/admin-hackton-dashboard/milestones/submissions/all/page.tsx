"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, Calendar, Download, FileText, Flag, User, 
  Loader2, CheckCircle, X, Search, Filter, Clock 
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

// Define types for submissions
type Submission = {
  id: string;
  participantId: string;
  milestoneId: string;
  filePath: string;
  fileName: string;
  submittedAt: string;
  reviewStatus: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  participant: {
    id: string;
    fullName?: string | null;
    firstName: string;
    secondName: string;
    familyName: string;
    email: string;
    teamId: string;
    team: {
      id: string;
      teamName: string;
    };
  };
  milestone: {
    id: string;
    title: string;
    dueDate: string;
  };
};

export default function AllMilestoneSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string>('accepted');
  const [resubmissionDeadline, setResubmissionDeadline] = useState<string>('');
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<boolean | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string>('');

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [milestones, setMilestones] = useState<{id: string, title: string}[]>([]);
  const [statusOptions] = useState([
    { value: 'all', label: 'جميع الحالات' },
    { value: 'accepted', label: 'مقبول' },
    { value: 'rejected', label: 'مرفوض' },
    { value: 'needs_resubmission', label: 'مطلوب إعادة تسليم' },
    { value: 'pending', label: 'قيد المراجعة' },
    { value: null, label: 'بانتظار المراجعة' }
  ]);
  
  // Get milestone from URL query parameter
  const searchParams = useSearchParams();
  const milestoneParam = searchParams.get('milestone');

  // Fetch all submissions
  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const response = await fetch('/api/admin/submissions');
        if (!response.ok) {
          throw new Error('فشل في جلب التسليمات');
        }
        const data = await response.json();
        setSubmissions(data);
        setFilteredSubmissions(data);
        
        // Extract unique milestones for filter
        const uniqueMilestones = Array.from(
          new Set(data.map((sub: Submission) => sub.milestone.id))
        ).map(id => {
          const submission = data.find((sub: Submission) => sub.milestone.id === id);
          return {
            id: id as string,
            title: submission ? submission.milestone.title : ''
          };
        });
        
        setMilestones(uniqueMilestones);
        
        // Set selected milestone from URL parameter if it exists
        if (milestoneParam) {
          setSelectedMilestone(milestoneParam);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات');
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [milestoneParam]);

  // Filter submissions when filter criteria change
  useEffect(() => {
    let result = submissions;
    
    // Filter by search term (participant name or team name)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(sub => 
        [sub.participant.fullName, sub.participant.firstName, sub.participant.secondName, sub.participant.familyName].filter(Boolean).join(' ').toLowerCase().includes(searchLower) ||
        sub.participant.team.teamName.toLowerCase().includes(searchLower) ||
        sub.milestone.title.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by milestone
    if (selectedMilestone !== 'all') {
      result = result.filter(sub => sub.milestone.id === selectedMilestone);
    }
    
    // Filter by status
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'null') {
        result = result.filter(sub => sub.reviewStatus === null);
      } else {
        result = result.filter(sub => sub.reviewStatus === selectedStatus);
      }
    }
    
    setFilteredSubmissions(result);
  }, [searchTerm, selectedMilestone, selectedStatus, submissions]);

  // Open review dialog
  const openReviewDialog = (submission: Submission) => {
    setSelectedSubmission(submission);
    setReviewStatus(submission.reviewStatus || 'accepted');
    setResubmissionDeadline('');
    setReviewComment(submission.reviewComment || '');
    setReviewSuccess(null);
    setReviewMessage('');
    setIsReviewDialogOpen(true);
  };

  // Submit review
  const submitReview = async () => {
    if (!selectedSubmission) return;

    setIsSubmitting(true);
    setReviewSuccess(null);
    setReviewMessage('');

    try {
      const response = await fetch(
        `/api/admin/milestones/${selectedSubmission.milestoneId}/submissions/${selectedSubmission.id}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reviewStatus,
            reviewComment,
            resubmissionDeadline:
              reviewStatus === 'needs_resubmission' && resubmissionDeadline
                ? new Date(resubmissionDeadline).toISOString()
                : undefined,
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        setReviewSuccess(true);
        setReviewMessage(
          result.phaseAdvanced
            ? `تم تحديث المراجعة — وتم نقل الفريق إلى: ${result.advancedTo}`
            : result.phaseReason
              ? `تم تحديث المراجعة — دون نقل المرحلة (${result.phaseReason})`
              : result.message || 'تم تحديث المراجعة بنجاح'
        );
        
        // Update the submissions list
        const updatedSubmissions = submissions.map(sub => 
          sub.id === selectedSubmission.id 
            ? { 
                ...sub, 
                reviewStatus, 
                reviewComment, 
                reviewedAt: new Date().toISOString() 
              } 
            : sub
        );
        
        setSubmissions(updatedSubmissions);
        
        // Close dialog after a delay
        setTimeout(() => {
          setIsReviewDialogOpen(false);
        }, 2000);
      } else {
        setReviewSuccess(false);
        setReviewMessage(result.error || 'حدث خطأ أثناء تحديث المراجعة');
      }
    } catch (err) {
      console.error('Error submitting review:', err);
      setReviewSuccess(false);
      setReviewMessage('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format date to a readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get status badge color
  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "accepted":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">مقبول</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">مرفوض</Badge>;
      case "needs_resubmission":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">مطلوب إعادة تسليم</Badge>;
      case "pending":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">قيد المراجعة</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">بانتظار المراجعة</Badge>;
    }
  };

  // Get participant full name
  const getParticipantName = (participant: Submission['participant']) => {
    return participant.fullName || [participant.firstName, participant.secondName, participant.familyName].filter(Boolean).join(' ').trim() || participant.email || 'غير متوفر';
  };

  // Format file size
  const formatFileSize = (filePath: string) => {
    // This would be implemented with actual file size calculation
    // For now, return a placeholder
    return "< 10 MB";
  };

  // Get counts for statistics
  const getSubmissionCounts = () => {
    const total = submissions.length;
    const pending = submissions.filter(sub => sub.reviewStatus === 'pending').length;
    const accepted = submissions.filter(sub => sub.reviewStatus === 'accepted').length;
    const rejected = submissions.filter(sub => sub.reviewStatus === 'rejected').length;
    const needsResubmission = submissions.filter(sub => sub.reviewStatus === 'needs_resubmission').length;
    const awaiting = submissions.filter(sub => sub.reviewStatus === null).length;
    
    return { total, pending, accepted, rejected, needsResubmission, awaiting };
  };

  const counts = getSubmissionCounts();

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">جميع التسليمات</h1>
          <p className="text-muted-foreground mt-1">
            مراجعة وتقييم جميع تسليمات المشاركين
          </p>
        </div>
        <Link href="/admin-hackton-dashboard/milestones">
          <Button variant="outline">
            العودة
            <ArrowRight className="mr-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي التسليمات</p>
                <p className="text-2xl font-bold">{counts.total}</p>
              </div>
              <FileText className="h-8 w-8 text-primary opacity-70" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">بانتظار المراجعة</p>
                <p className="text-2xl font-bold">{counts.awaiting}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">قيد المراجعة</p>
                <p className="text-2xl font-bold">{counts.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">مقبولة</p>
                <p className="text-2xl font-bold">{counts.accepted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">مرفوضة</p>
                <p className="text-2xl font-bold">{counts.rejected}</p>
              </div>
              <X className="h-8 w-8 text-red-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="البحث عن مشارك أو فريق..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        
        <Select value={selectedMilestone} onValueChange={setSelectedMilestone}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="المرحلة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع المراحل</SelectItem>
            {milestones.map(milestone => (
              <SelectItem key={milestone.id} value={milestone.id}>
                {milestone.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(status => (
              <SelectItem key={status.value || 'null'} value={status.value || 'null'}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-600">
          <p>{error}</p>
        </div>
      ) : filteredSubmissions.length > 0 ? (
        <div className="space-y-4">
          {filteredSubmissions.map((submission) => (
            <Card key={submission.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold flex items-center">
                      <User className="ml-2 h-5 w-5 text-blue-500" />
                      {getParticipantName(submission.participant)}
                    </h2>
                    
                    <div className="mt-2 flex items-center text-sm text-muted-foreground">
                      <Flag className="ml-1 h-4 w-4" />
                      <span>الفريق: {submission.participant.team.teamName}</span>
                    </div>
                    
                    <div className="mt-1 flex items-center text-sm text-muted-foreground">
                      <Calendar className="ml-1 h-4 w-4" />
                      <span>تاريخ التقديم: {formatDate(submission.submittedAt)}</span>
                    </div>
                    
                    <div className="mt-1 flex items-center text-sm font-medium text-primary">
                      <FileText className="ml-1 h-4 w-4" />
                      <span>المرحلة: {submission.milestone.title}</span>
                    </div>
                    
                    {submission.reviewComment && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-md">
                        <h3 className="text-sm font-semibold">ملاحظات المراجعة:</h3>
                        <p className="text-sm mt-1">{submission.reviewComment}</p>
                      </div>
                    )}
                    
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold mb-2">الملف المرفق:</h3>
                      <div className="flex items-center text-sm">
                        <FileText className="ml-2 h-4 w-4 text-blue-500" />
                        <span className="ml-1">{submission.fileName}</span>
                        <span className="text-muted-foreground">({formatFileSize(submission.filePath)})</span>
                        <a 
                          href={submission.filePath} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mr-auto"
                        >
                          <Button variant="ghost" size="sm" className="p-0 h-auto">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end">
                    {getStatusBadge(submission.reviewStatus)}
                    
                    <div className="mt-4 flex gap-2">
                      <Button 
                        size="sm"
                        onClick={() => openReviewDialog(submission)}
                      >
                        {submission.reviewStatus ? 'تعديل المراجعة' : 'مراجعة'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">لا توجد تسليمات للمراجعة</h2>
          <p className="mt-2 text-muted-foreground">ستظهر هنا التسليمات المقدمة من الفرق المشاركة</p>
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>مراجعة التسليم</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedSubmission && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">المشارك:</h3>
                  <p>{getParticipantName(selectedSubmission.participant)}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold">الفريق:</h3>
                  <p>{selectedSubmission.participant.team.teamName}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold">المرحلة:</h3>
                  <p>{selectedSubmission.milestone.title}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold">الملف المرفق:</h3>
                  <p>{selectedSubmission.fileName}</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">حالة المراجعة</Label>
                  <RadioGroup 
                    id="status" 
                    value={reviewStatus} 
                    onValueChange={setReviewStatus}
                    className="flex flex-col space-y-1"
                  >
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="accepted" id="accepted" />
                      <Label htmlFor="accepted" className="text-green-600">مقبول</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="rejected" id="rejected" />
                      <Label htmlFor="rejected" className="text-red-600">مرفوض</Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="needs_resubmission" id="needs_resubmission" />
                      <Label htmlFor="needs_resubmission" className="text-amber-600">
                        طلب إعادة تسليم
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="pending" id="pending" />
                      <Label htmlFor="pending" className="text-blue-600">قيد المراجعة</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    {reviewStatus === 'accepted'
                      ? 'القبول ينقل الفريق تلقائياً إلى المرحلة التالية إذا كان التسليم مرتبطاً بمرحلته الحالية.'
                      : reviewStatus === 'rejected'
                      ? 'الرفض يضع على الفريق علامة "متعثّر" في مرحلته الحالية.'
                      : reviewStatus === 'needs_resubmission'
                      ? 'يعيد فتح التسليم للفريق دون تغيير مرحلته، ويُرسل لهم الملاحظات.'
                      : 'إعادة التسليم إلى "قيد المراجعة" لا تغيّر المرحلة ولا تُرسل إشعاراً.'}
                  </p>
                </div>

                {reviewStatus === 'needs_resubmission' && (
                  <div className="space-y-2">
                    <Label htmlFor="resub-deadline">مهلة إعادة التسليم (اختياري)</Label>
                    <Input
                      id="resub-deadline"
                      type="datetime-local"
                      value={resubmissionDeadline}
                      onChange={(e) => setResubmissionDeadline(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      إذا تُركت فارغة، يبقى الموعد النهائي الأصلي سارياً — وإن كان قد انتهى فلن
                      يتمكن الفريق من إعادة التسليم.
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="comment">
                    ملاحظات {reviewStatus === 'needs_resubmission' ? '(مطلوبة)' : '(اختياري)'}
                  </Label>
                  <Textarea
                    id="comment"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="أضف ملاحظاتك هنا..."
                    rows={4}
                  />
                </div>

                {reviewSuccess !== null && (
                  <div className={`p-3 rounded-md ${
                    reviewSuccess ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    <p className="text-sm">{reviewMessage}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter className="sm:justify-start">
            <Button
              type="submit"
              onClick={submitReview}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  حفظ المراجعة
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsReviewDialogOpen(false)}
              disabled={isSubmitting}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
