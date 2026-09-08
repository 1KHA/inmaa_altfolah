"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Calendar, Download, FileText, Flag, User, Loader2, CheckCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSearchParams } from "next/navigation";

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
};

type Milestone = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: string;
  requirements: string;
  submissionCount: number;
  submissionLink: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function MilestoneSubmissionsPage() {
  const searchParams = useSearchParams();
  const milestoneId = searchParams.get('milestoneId');
  
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string>('accepted');
  // Only used when asking for a resubmission: gives the team a window that
  // overrides the milestone's own (possibly passed) due date.
  const [resubmissionDeadline, setResubmissionDeadline] = useState<string>('');
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<boolean | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string>('');

  // Fetch submissions for the milestone
  useEffect(() => {
    const fetchSubmissions = async () => {
      if (!milestoneId) {
        setError('معرف المرحلة غير موجود');
        setLoading(false);
        return;
      }

      try {
        // Fetch milestone details
        const milestoneResponse = await fetch(`/api/admin/milestones/${milestoneId}`);
        if (!milestoneResponse.ok) {
          throw new Error('فشل في جلب تفاصيل المرحلة');
        }
        const milestoneData = await milestoneResponse.json();
        setMilestone(milestoneData);

        // Fetch submissions
        const submissionsResponse = await fetch(`/api/admin/milestones/${milestoneId}/submissions`);
        if (!submissionsResponse.ok) {
          throw new Error('فشل في جلب التسليمات');
        }
        const submissionsData = await submissionsResponse.json();
        setSubmissions(submissionsData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'حدث خطأ أثناء جلب البيانات');
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [milestoneId]);

  // Open review dialog
  const openReviewDialog = (submission: Submission) => {
    setSelectedSubmission(submission);
    setReviewStatus(submission.reviewStatus || 'accepted');
    setReviewComment(submission.reviewComment || '');
    setResubmissionDeadline('');
    setReviewSuccess(null);
    setReviewMessage('');
    setIsReviewDialogOpen(true);
  };

  // Submit review
  const submitReview = async () => {
    if (!selectedSubmission || !milestoneId) return;

    setIsSubmitting(true);
    setReviewSuccess(null);
    setReviewMessage('');

    try {
      const response = await fetch(
        `/api/admin/milestones/${milestoneId}/submissions/${selectedSubmission.id}/review`,
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
        setSubmissions(submissions.map(sub => 
          sub.id === selectedSubmission.id 
            ? { 
                ...sub, 
                reviewStatus, 
                reviewComment, 
                reviewedAt: new Date().toISOString() 
              } 
            : sub
        ));

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

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">مراجعة التسليمات</h1>
          {milestone && (
            <p className="text-muted-foreground mt-1">
              {milestone.title}
            </p>
          )}
        </div>
        <Link href="/admin-hackton-dashboard/milestones">
          <Button variant="outline">
            العودة
            <ArrowRight className="mr-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-600">
          <p>{error}</p>
        </div>
      ) : submissions.length > 0 ? (
        <div className="space-y-4">
          {submissions.map((submission) => (
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
                      إذا تُركت فارغة، يبقى الموعد النهائي الأصلي للتسليم سارياً — وإن كان قد
                      انتهى فلن يتمكن الفريق من إعادة التسليم.
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
