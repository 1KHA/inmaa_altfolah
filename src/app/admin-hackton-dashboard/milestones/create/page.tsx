"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ArrowRight, Calendar, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePhases } from "@/components/phases/phase-controls";

export default function CreateMilestonePage() {
  const router = useRouter();
  const [milestone, setMilestone] = useState({
    title: "",
    description: "",
    dueDate: "",
    requirements: "",
  });

  // Linking a milestone to a phase is what makes accepting a submission
  // advance the team automatically. Leaving it empty keeps the old behaviour.
  const { phases } = usePhases();
  const [phaseId, setPhaseId] = useState("");
  const [allowLateSubmission, setAllowLateSubmission] = useState(false);
  
  // State for individual requirements
  const [requirements, setRequirements] = useState<string[]>([]);
  const [newRequirement, setNewRequirement] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add a new requirement
  const addRequirement = () => {
    if (newRequirement.trim()) {
      setRequirements([...requirements, newRequirement.trim()]);
      setNewRequirement("");
    }
  };

  // Remove a requirement
  const removeRequirement = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    // Check if the due date is in the past
    const selectedDate = new Date(milestone.dueDate);
    const currentDate = new Date();
    
    if (selectedDate < currentDate) {
      setError("لا يمكن اختيار موعد نهائي في الماضي");
      setIsSubmitting(false);
      return;
    }
    
    try {
      // Format the date to ISO string if it's not already
      const formattedDate = selectedDate.toISOString();
      
      // Create the new milestone via API
      const response = await fetch('/api/admin/milestones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: milestone.title,
          description: milestone.description,
          dueDate: formattedDate,
          status: "upcoming",
          requirements: requirements,
          phaseId: phaseId || null,
          allowLateSubmission,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create milestone');
      }
      
      // Show success message
      alert("تم إنشاء التسليم بنجاح!");
      
      // Redirect to milestones page
      router.push("/admin-hackton-dashboard/milestones");
    } catch (err) {
      console.error('Error creating milestone:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">إنشاء تسليم جديد</h1>
        <Link href="/admin-hackton-dashboard/milestones">
          <Button variant="outline">
            العودة
            <ArrowRight className="mr-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان التسليم</Label>
              <Input
                id="title"
                value={milestone.title}
                onChange={(e) => setMilestone({ ...milestone, title: e.target.value })}
                placeholder="مثال: تسليم النموذج الأولي"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">وصف التسليم</Label>
              <Textarea
                id="description"
                value={milestone.description}
                onChange={(e) => setMilestone({ ...milestone, description: e.target.value })}
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
                  value={milestone.dueDate}
                  onChange={(e) => setMilestone({ ...milestone, dueDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="milestone-phase">المرحلة (اختياري)</Label>
              <Select
                value={phaseId || "none"}
                onValueChange={(v) => setPhaseId(v === "none" ? "" : v)}
                disabled={phases.length === 0}
              >
                <SelectTrigger id="milestone-phase" className="w-full">
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
                عند ربط التسليم بمرحلة، قبول التسليم ينقل الفريق تلقائياً إلى المرحلة التالية،
                ورفضه يضع عليه علامة &quot;متعثّر&quot;.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md border p-3">
              <input
                id="allow-late"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={allowLateSubmission}
                onChange={(e) => setAllowLateSubmission(e.target.checked)}
              />
              <div>
                <Label htmlFor="allow-late" className="cursor-pointer">السماح بالتسليم المتأخر</Label>
                <p className="text-xs text-muted-foreground">
                  بدون تفعيل هذا الخيار، لن يتمكن المشاركون من التسليم بعد انتهاء الموعد النهائي.
                  التسليمات المتأخرة تُعلَّم بوسم &quot;متأخر&quot;.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">متطلبات التسليم</Label>
              
              <div className="space-y-4">
                {/* List of current requirements */}
                {requirements.length > 0 && (
                  <div className="space-y-2 bg-muted p-3 rounded-md">
                    {requirements.map((req, index) => (
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
                
                {requirements.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    أضف متطلبات التسليم واحدًا تلو الآخر. يجب إضافة متطلب واحد على الأقل.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 p-4 rounded-md text-red-600 mb-4">
                <p>{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={isSubmitting || requirements.length === 0 || !milestone.title || !milestone.description || !milestone.dueDate}
              >
                {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء التسليم'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
