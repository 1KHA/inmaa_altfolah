"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Flag, Clock, Loader2, Save, X } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useEffect, useState } from "react";
import { usePhases } from "@/components/phases/phase-controls";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  phaseId?: string | null;
  allowLateSubmission?: boolean;
  createdAt: string;
  updatedAt: string;
};

// Dialog types
type DialogType = "details" | "edit" | "delete" | null;

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    requirements: [] as string[],
    phaseId: "",
    allowLateSubmission: false,
  });
  const { phases } = usePhases();
  const [newRequirement, setNewRequirement] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  // Open dialog handlers
  const openDetailsDialog = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    setDialogType("details");
  };
  
  const openEditDialog = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    // Convert ISO date string to local datetime format for input
    const date = new Date(milestone.dueDate);
    const localDatetime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16); // Format: "YYYY-MM-DDTHH:MM"
    
    setEditForm({
      title: milestone.title,
      description: milestone.description,
      dueDate: localDatetime,
      requirements: [...milestone.requirements],
      phaseId: milestone.phaseId || "",
      allowLateSubmission: Boolean(milestone.allowLateSubmission),
    });
    setDialogType("edit");
  };
  
  const openDeleteDialog = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    setDialogType("delete");
  };
  
  const closeDialog = () => {
    setDialogType(null);
    setSelectedMilestone(null);
    setFormError(null);
  };
  
  // Add/remove requirements in edit form
  const addRequirement = () => {
    if (newRequirement.trim()) {
      setEditForm({
        ...editForm,
        requirements: [...editForm.requirements, newRequirement.trim()]
      });
      setNewRequirement("");
    }
  };
  
  const removeRequirement = (index: number) => {
    setEditForm({
      ...editForm,
      requirements: editForm.requirements.filter((_, i) => i !== index)
    });
  };
  
  // Update milestone
  const updateMilestone = async () => {
    if (!selectedMilestone) return;
    
    setIsSubmitting(true);
    setFormError(null);
    
    try {
      // Check if due date is in the past
      const selectedDate = new Date(editForm.dueDate);
      const currentDate = new Date();
      
      if (selectedDate < currentDate) {
        setFormError("لا يمكن اختيار موعد نهائي في الماضي");
        setIsSubmitting(false);
        return;
      }
      
      const response = await fetch('/api/admin/milestones', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedMilestone.id,
          title: editForm.title,
          description: editForm.description,
          dueDate: new Date(editForm.dueDate).toISOString(),
          requirements: editForm.requirements,
          phaseId: editForm.phaseId || null,
          allowLateSubmission: editForm.allowLateSubmission,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update milestone');
      }
      
      const updatedMilestone = await response.json();
      
      // Update the milestones state with the updated milestone
      setMilestones(milestones.map(m => 
        m.id === updatedMilestone.id ? updatedMilestone : m
      ));
      
      closeDialog();
      alert("تم تحديث التسليم بنجاح!");
    } catch (err) {
      console.error('Error updating milestone:', err);
      setFormError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Delete a milestone
  const deleteMilestone = async () => {
    if (!selectedMilestone) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/admin/milestones', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: selectedMilestone.id }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete milestone');
      }
      
      // Remove the deleted milestone from the state
      setMilestones(milestones.filter(milestone => milestone.id !== selectedMilestone.id));
      
      closeDialog();
      alert('تم حذف التسليم بنجاح');
    } catch (err) {
      console.error('Error deleting milestone:', err);
      alert('حدث خطأ أثناء حذف التسليم');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">التسليمات</h1>
        <Link href="/admin-hackton-dashboard/milestones/create">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            إضافة تسليم جديد
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flag className="h-5 w-5 text-blue-500" />
              التسليمات القادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              عرض جميع التسليمات المستقبلية المجدولة للمشاركين.
            </p>
            <Link href="/admin-hackton-dashboard/milestones/upcoming">
              <Button variant="outline" className="w-full">عرض التسليمات القادمة</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              إنشاء تسليم جديد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              إنشاء تسليم جديد وتحديد التفاصيل والمواعيد النهائية.
            </p>
            <Link href="/admin-hackton-dashboard/milestones/create">
              <Button variant="outline" className="w-full">إنشاء تسليم جديد</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flag className="h-5 w-5 text-yellow-500" />
              مراجعة التسليمات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              عرض ومراجعة التسليمات المقدمة من المشاركين.
            </p>
            <Link href="/admin-hackton-dashboard/milestones/submissions/all">
              <Button variant="outline" className="w-full">عرض جميع التسليمات</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">نظرة عامة على التسليمات</h2>
        
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="bg-red-50 p-4 rounded-md text-red-600">
            <p>{error}</p>
          </div>
        ) : milestones.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {milestones.map((milestone) => (
              <Card key={milestone.id} className="overflow-hidden">
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold">{milestone.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{milestone.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>الموعد النهائي: {formatDate(milestone.dueDate)}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">المتطلبات:</h4>
                    <ul className="text-sm space-y-1">
                      {milestone.requirements.map((req, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="mt-4 flex justify-between items-center">
                    <div className="text-sm">
                      <span className="font-medium">التسليمات: </span>
                      <span>{milestone.submissionCount || 0}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => openDeleteDialog(milestone)}
                      >
                        حذف
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openEditDialog(milestone)}
                      >
                        تعديل
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => openDetailsDialog(milestone)}
                      >
                        عرض التفاصيل
                      </Button>
                      <Link href={`/admin-hackton-dashboard/milestones/submissions/all?milestone=${milestone.id}`}>
                        <Button 
                          variant="secondary" 
                          size="sm"
                        >
                          عرض التسليمات
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            لا توجد تسليمات مجدولة حالياً. قم بإنشاء تسليم جديد للبدء.
          </p>
        )}
      </div>
      
      {/* Details Dialog */}
      <Dialog open={dialogType === "details"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">تفاصيل التسليم</DialogTitle>
          </DialogHeader>
          
          {selectedMilestone && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedMilestone.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedMilestone.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-1">الموعد النهائي</h4>
                  <p className="text-sm">{formatDate(selectedMilestone.dueDate)}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">الحالة</h4>
                  <p className="text-sm">{selectedMilestone.status}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">عدد التسليمات</h4>
                  <p className="text-sm">{selectedMilestone.submissionCount || 0}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">تاريخ الإنشاء</h4>
                  <p className="text-sm">{formatDate(selectedMilestone.createdAt)}</p>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-2">المتطلبات:</h4>
                <ul className="text-sm space-y-1 bg-muted p-3 rounded-md">
                  {selectedMilestone.requirements.map((req, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={closeDialog}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Dialog */}
      <Dialog open={dialogType === "edit"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">تعديل التسليم</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان التسليم</Label>
              <Input
                id="title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="مثال: تسليم النموذج الأولي"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">وصف التسليم</Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="اشرح ما هو مطلوب من المشاركين في هذا التسليم"
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">الموعد النهائي</Label>
              <div className="flex items-center">
                <Calendar className="ml-2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="dueDate"
                  type="datetime-local"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phase">المرحلة (اختياري)</Label>
              <Select
                value={editForm.phaseId || "none"}
                onValueChange={(v) => setEditForm({ ...editForm, phaseId: v === "none" ? "" : v })}
                disabled={phases.length === 0}
              >
                <SelectTrigger id="edit-phase" className="w-full">
                  <SelectValue placeholder="بدون ربط بمرحلة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ربط بمرحلة</SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                قبول التسليم ينقل الفريق إلى المرحلة التالية تلقائياً، ورفضه يضع علامة &quot;متعثّر&quot;.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md border p-3">
              <input
                id="edit-allow-late"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={editForm.allowLateSubmission}
                onChange={(e) => setEditForm({ ...editForm, allowLateSubmission: e.target.checked })}
              />
              <div>
                <Label htmlFor="edit-allow-late" className="cursor-pointer">السماح بالتسليم المتأخر</Label>
                <p className="text-xs text-muted-foreground">
                  بدون تفعيله، لن يتمكن المشاركون من التسليم بعد انتهاء الموعد النهائي.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">متطلبات التسليم</Label>
              
              <div className="space-y-4">
                {/* List of current requirements */}
                {editForm.requirements.length > 0 && (
                  <div className="space-y-2 bg-muted p-3 rounded-md">
                    {editForm.requirements.map((req, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span>{req}</span>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeRequirement(index)}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Add new requirement */}
                <div className="flex gap-2">
                  <Input
                    id="newRequirement"
                    value={newRequirement}
                    onChange={(e) => setNewRequirement(e.target.value)}
                    placeholder="أضف متطلب جديد"
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={addRequirement}
                  >
                    <Plus className="h-4 w-4 ml-1" />
                    إضافة
                  </Button>
                </div>
                
                {editForm.requirements.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    أضف متطلبات التسليم واحدًا تلو الآخر. يجب إضافة متطلب واحد على الأقل.
                  </p>
                )}
              </div>
            </div>
            
            {formError && (
              <div className="bg-red-50 p-4 rounded-md text-red-600 mb-4">
                <p>{formError}</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
            <Button 
              onClick={updateMilestone} 
              disabled={isSubmitting || editForm.requirements.length === 0 || !editForm.title || !editForm.description || !editForm.dueDate}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="ml-2 h-4 w-4" />
                  حفظ التغييرات
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={dialogType === "delete"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف هذا التسليم؟ هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          
          {selectedMilestone && (
            <div className="py-4">
              <h3 className="font-medium">{selectedMilestone.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{selectedMilestone.description}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
            <Button 
              variant="destructive" 
              onClick={deleteMilestone}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                'تأكيد الحذف'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
