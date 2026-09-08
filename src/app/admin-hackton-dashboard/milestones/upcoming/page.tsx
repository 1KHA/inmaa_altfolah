"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Calendar, Clock, Flag } from "lucide-react";
import Link from "next/link";

// Mock data for upcoming milestones
const upcomingMilestones = [
  {
    id: "1",
    title: "تسليم النموذج الأولي",
    description: "تقديم نموذج أولي للمشروع يوضح الفكرة الأساسية والوظائف الرئيسية.",
    dueDate: "2025-08-15T23:59:59",
    status: "upcoming",
  },
  {
    id: "2",
    title: "تقرير تقدم المشروع",
    description: "تقديم تقرير يوضح التقدم المحرز في المشروع والتحديات التي تمت مواجهتها.",
    dueDate: "2025-09-01T23:59:59",
    status: "upcoming",
  },
];

export default function UpcomingMilestonesPage() {
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

  // Calculate days remaining
  const getDaysRemaining = (dateString: string) => {
    const dueDate = new Date(dateString);
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">التسليمات القادمة</h1>
        <div className="flex gap-2">
          <Link href="/admin-hackton-dashboard/milestones/create">
            <Button>إضافة تسليم جديد</Button>
          </Link>
          <Link href="/admin-hackton-dashboard/milestones">
            <Button variant="outline">
              العودة
              <ArrowRight className="mr-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {upcomingMilestones.length > 0 ? (
        <div className="space-y-4">
          {upcomingMilestones.map((milestone) => (
            <Card key={milestone.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold flex items-center">
                      <Flag className="ml-2 h-5 w-5 text-blue-500" />
                      {milestone.title}
                    </h2>
                    <p className="mt-2 text-muted-foreground">{milestone.description}</p>
                    
                    <div className="mt-4 flex items-center text-sm text-muted-foreground">
                      <Calendar className="ml-1 h-4 w-4" />
                      <span>الموعد النهائي: {formatDate(milestone.dueDate)}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end">
                    <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <Clock className="ml-1 h-4 w-4" />
                      متبقي {getDaysRemaining(milestone.dueDate)} يوم
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm">تعديل</Button>
                      <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600">حذف</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Flag className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">لا توجد تسليمات قادمة</h2>
          <p className="mt-2 text-muted-foreground">قم بإنشاء تسليم جديد للبدء</p>
          <Link href="/admin-hackton-dashboard/milestones/create" className="mt-4 inline-block">
            <Button>إنشاء تسليم جديد</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
