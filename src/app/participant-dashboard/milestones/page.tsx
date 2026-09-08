"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, FileText, CheckCircle, AlertCircle, XCircle, Loader2, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MAX_FILE_SIZE_MB } from "@/lib/constants";
import { prepareUpload, validateUploadFile, UPLOAD_ACCEPT, UPLOAD_HINT } from "@/lib/client-upload";

// Define the Milestone type
type Milestone = {
  id: string;
  title: string;
  description: string;
  dueDate: string; // ISO date string
  status: string;
  requirements: string[];
  submissionCount: number;
  submissionLink?: string | null;
  createdAt: string;
  updatedAt: string;
  hasSubmitted?: boolean; // Track if the current participant has submitted
  // Real submission state, supplied by /api/milestones. Before this the card
  // only knew "submitted / not submitted", so a participant could not see the
  // reviewer's verdict, and the deadline was never enforced in the UI.
  reviewStatus?: string | null;
  reviewComment?: string | null;
  resubmissionCount?: number;
  canSubmit?: boolean;
  canResubmit?: boolean;
  submitBlockedReason?: string | null;
  effectiveDeadline?: string | null;
  isLate?: boolean;
  allowLateSubmission?: boolean;
};

// Define the submission response type
type SubmissionResponse = {
  success: boolean;
  message: string;
  error?: string;
  submission?: any;
};

export default function ParticipantMilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch milestones from API
  useEffect(() => {
    const fetchMilestones = async () => {
      try {
        const response = await fetch('/api/milestones');
        
        if (!response.ok) {
          throw new Error('Failed to fetch milestones');
        }
        
        const data = await response.json();
        setMilestones(data);
      } catch (err) {
        console.error('Error fetching milestones:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };
    
    fetchMilestones();
  }, []);

  // Format date to Arabic format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "d MMMM yyyy", { locale: ar });
  };

  // Get days remaining until due date
  const getDaysRemaining = (dateString: string) => {
    const dueDate = new Date(dateString);
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get status badge based on milestone status and days remaining
  const getStatusBadge = (status: string, dueDate: string) => {
    const daysRemaining = getDaysRemaining(dueDate);
    
    if (status === "completed") {
      return (
        <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs">
          <CheckCircle className="h-3 w-3" />
          <span>مكتمل</span>
        </div>
      );
    } else if (status === "overdue") {
      return (
        <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs">
          <AlertCircle className="h-3 w-3" />
          <span>متأخر</span>
        </div>
      );
    } else if (daysRemaining <= 3) {
      return (
        <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs">
          <Clock className="h-3 w-3" />
          <span>قريب ({daysRemaining} أيام)</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs">
          <Clock className="h-3 w-3" />
          <span>{daysRemaining} أيام متبقية</span>
        </div>
      );
    }
  };

  // Open the submission dialog
  const openSubmissionDialog = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    setSelectedFile(null);
    setSubmissionStatus(null);
    setIsDialogOpen(true);
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const problem = validateUploadFile(file);
      if (problem) {
        setSubmissionStatus({ success: false, message: problem });
        e.target.value = "";
        setSelectedFile(null);
        return;
      }
      setSubmissionStatus(null);
      setSelectedFile(file);
    }
  };

  // Submit a milestone
  const submitMilestone = async () => {
    if (!selectedMilestone || !selectedFile) {
      setSubmissionStatus({
        success: false,
        message: "يرجى اختيار ملف للتسليم"
      });
      return;
    }

    // Validate file size (25MB max)
    const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setSubmissionStatus({
        success: false,
        message: `حجم الملف يجب أن يكون أقل من ${MAX_FILE_SIZE_MB} ميجابايت`
      });
      return;
    }

    setIsSubmitting(true);
    setSubmissionStatus(null);

    try {
      // Step 1: Upload file to server-side API endpoint
      setSubmissionStatus({
        success: true,
        message: "جاري رفع الملف..."
      });

      // Preferred: upload straight from the browser to Supabase Storage so the
      // file never passes through a Vercel function (bodies over ~4.5 MB are
      // rejected by the platform). The API path below is only a fallback for
      // small files when direct upload is unavailable.
      let publicUrl: string | null = null;
      const outcome = await prepareUpload(selectedFile, 'milestones');
      if (outcome.mode === 'error') throw new Error(outcome.message);
      if (outcome.mode === 'direct') publicUrl = outcome.publicUrl;

      // Create form data for file upload (fallback path)
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      // Send file to server-side API endpoint (only when not already uploaded)
      const uploadResponse = publicUrl
        ? null
        : await fetch("/api/participant/upload-milestone-file", {
            method: "POST",
            body: formData,
          });
      
      let errorMessage = "فشل رفع الملف";
      
      if (uploadResponse && !uploadResponse.ok) {
        try {
          const errorData = await uploadResponse.json();
          if (errorData.error) {
            // Translate common error messages to Arabic
            if (errorData.error.includes("File size must be less than")) {
              errorMessage = `حجم الملف يجب أن يكون أقل من ${MAX_FILE_SIZE_MB} ميجابايت`;
            } else if (errorData.error.includes("File type not allowed")) {
              errorMessage = "نوع الملف غير مسموح به. يرجى رفع ملف PDF أو Word أو PowerPoint أو ZIP أو RAR أو JPEG أو PNG";
            } else {
              errorMessage = errorData.error;
            }
          }
        } catch (e) {
          console.error("Error parsing error response:", e);
        }
        throw new Error(errorMessage);
      }
      
      if (!publicUrl) {
        const uploadResult = await uploadResponse!.json();
        if (!uploadResult.success || !uploadResult.publicUrl) {
          throw new Error("فشل رفع الملف: " + (uploadResult.error || "خطأ غير معروف"));
        }
        publicUrl = uploadResult.publicUrl as string;
      }

      // Step 2: Send metadata to API to create submission record
      setSubmissionStatus({
        success: true,
        message: "جاري حفظ التسليم..."
      });

      const response = await fetch("/api/participant/submit-milestone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          milestoneId: selectedMilestone.id,
          filePath: publicUrl,
          fileName: selectedFile.name,
        }),
      });

      const result: SubmissionResponse = await response.json();

      if (response.ok) {
        setSubmissionStatus({
          success: true,
          message: result.message || "تم تسليم المشروع بنجاح"
        });

        // Update the milestone status in the UI
        setMilestones(milestones.map(m => 
          m.id === selectedMilestone.id 
            ? {
                ...m,
                hasSubmitted: true,
                submissionCount: m.submissionCount + 1,
                // A resubmission goes back to pending review and the upload closes again.
                reviewStatus: 'pending',
                reviewComment: null,
                canSubmit: false,
                canResubmit: false,
                submitBlockedReason: 'لقد قمت بتسليم هذا المشروع بالفعل',
              }
            : m
        ));

        // Close the dialog after a delay
        setTimeout(() => {
          setIsDialogOpen(false);
        }, 2000);
      } else {
        // Handle specific error for duplicate submission
        const errorMessage = result.error || "حدث خطأ أثناء تسليم المشروع";
        
        // If this is a duplicate submission error, update the UI to reflect that
        if (errorMessage.includes("لقد قمت بتسليم هذا المشروع بالفعل")) {
          // Update the milestone status in the UI to prevent further attempts
          setMilestones(milestones.map(m => 
            m.id === selectedMilestone.id 
              ? { ...m, hasSubmitted: true } 
              : m
          ));
        }
        
        setSubmissionStatus({
          success: false,
          message: errorMessage
        });
      }
    } catch (err) {
      console.error("Error submitting milestone:", err);
      setSubmissionStatus({
        success: false,
        message: err instanceof Error ? err.message : "حدث خطأ أثناء الاتصال بالخادم"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">التسليمات</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-600">
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {milestones.length > 0 ? (
            milestones.map((milestone) => (
              <Card key={milestone.id} className="overflow-hidden border-r-4 border-r-primary">
                <div className="p-3 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-0">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <h3 className="text-xl font-semibold">{milestone.title}</h3>
                        {getStatusBadge(milestone.status, milestone.dueDate)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{milestone.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm mt-2 sm:mt-0">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>الموعد النهائي: {formatDate(milestone.dueDate)}</span>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <h4 className="text-sm font-medium mb-3">المتطلبات:</h4>
                    <ul className="text-sm space-y-2 bg-muted p-4 rounded-lg">
                      {milestone.requirements.map((req, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* The reviewer's verdict, and the notes when they asked for a redo. */}
                  {milestone.reviewStatus === 'needs_resubmission' && milestone.reviewComment && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                        <AlertCircle className="h-4 w-4" />
                        مطلوب إعادة تسليم
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-amber-900">
                        {milestone.reviewComment}
                      </p>
                      {milestone.effectiveDeadline && (
                        <p className="mt-1 text-xs text-amber-700">
                          المهلة: {formatDate(milestone.effectiveDeadline)}
                        </p>
                      )}
                    </div>
                  )}
                  {milestone.reviewStatus === 'rejected' && milestone.reviewComment && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm font-semibold text-red-800">ملاحظات المراجعة</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-red-900">
                        {milestone.reviewComment}
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-end">
                    {/* Order matters: a resubmission request must beat "already submitted". */}
                    {milestone.canResubmit ? (
                      <Button
                        className="w-full gap-2 sm:w-auto"
                        variant="default"
                        onClick={() => openSubmissionDialog(milestone)}
                      >
                        <FileText className="h-4 w-4" />
                        إعادة التسليم
                      </Button>
                    ) : milestone.hasSubmitted ? (
                      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                        {milestone.reviewStatus === 'accepted' ? (
                          <span className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            تم القبول
                          </span>
                        ) : milestone.reviewStatus === 'rejected' ? (
                          <span className="flex items-center gap-2 text-red-600">
                            <XCircle className="h-5 w-5" />
                            مرفوض
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            تم التسليم — قيد المراجعة
                          </span>
                        )}
                        {milestone.isLate && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            سُلّم متأخراً
                          </span>
                        )}
                        {(milestone.resubmissionCount ?? 0) > 0 && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            إعادة تسليم ×{milestone.resubmissionCount}
                          </span>
                        )}
                      </div>
                    ) : milestone.canSubmit === false || milestone.status === "completed" ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        <span>{milestone.submitBlockedReason || 'التسليم مغلق'}</span>
                      </div>
                    ) : (
                      <Button 
                        className="gap-2 w-full sm:w-auto"
                        onClick={() => openSubmissionDialog(milestone)}
                      >
                        <FileText className="h-4 w-4" />
                        تسليم المشروع
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                لا توجد تسليمات مجدولة حالياً.
              </p>
            </div>
          )}
        </div>
      )}

      {/* File Upload Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسليم المشروع</DialogTitle>
            <DialogDescription>
              {selectedMilestone && (
                <span>تسليم مشروع لـ: {selectedMilestone.title}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file">اختر ملف المشروع</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="file"
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {UPLOAD_HINT}
              </p>
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedFile(null)}
                  className="h-6 w-6"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {submissionStatus && (
              <div className={`p-3 rounded-md ${
                submissionStatus.success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
              }`}>
                <p className="text-sm">{submissionStatus.message}</p>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex-col sm:flex-row sm:justify-start gap-2">
            <Button
              type="submit"
              onClick={submitMilestone}
              disabled={!selectedFile || isSubmitting}
              className="gap-2 w-full sm:w-auto order-1 sm:order-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التسليم...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  تأكيد التسليم
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
