"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  UserCheck,
  Trophy,
  Calendar,
  FileText,
  TrendingUp,
  Bell,
  Award,
  BookOpen,
  CheckCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { showAdminToast } from "@/components/admin/admin-toaster";
import { LineChart, BarChart, PieChart } from "../../../components/Charts";

// Define the dashboard statistics type
interface DashboardStats {
  totalParticipants: number;
  totalTeams: number;
  individualParticipants: number;
  totalMentors: number;
  totalEvents: number;
  completedEvents: number;
  upcomingEvents: number;
  totalEventRegistrations: number;
  totalSubmissions: number;
  pendingSubmissions: number;
  acceptedSubmissions: number;
  totalMentorBookings: number;
  completedMentorBookings: number;
  teamDistribution: { name: string; count: number }[];
  milestones: { id: string; title: string; submissionCount: number }[];
  recentNotifications: {
    id: string;
    title: string;
    message: string;
    type: string;
    isRead: boolean;
    recipientType: string;
    recipientId: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    actionUrl?: string;
    createdAt: string;
    updatedAt: string;
  }[];
  upcomingEventsList: {
    id: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    location: string;
    capacity: number;
    type: string;
    plan: string;
    presenter: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[];
  recentSubmissions: {
    id: string;
    milestoneTitle: string;
    teamName: string;
    participantName: string;
    submittedAt: string;
    reviewStatus: string | null;
  }[];
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/admin/dashboard/stats", {
          credentials: "include",
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard statistics");
        }
        
        const data = await response.json();
        setStats(data);
        setError(null);
      } catch (err) {
        console.error("Error fetching dashboard stats:", err);
        setError("حدث خطأ أثناء جلب إحصائيات لوحة التحكم");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    showAdminToast({
      title: "تبديل التبويب",
      description: `تم التبديل إلى تبويب ${value === "overview" ? "النظرة العامة" : "الإحصائيات"}`,
      variant: "default",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-2 text-lg">جاري تحميل البيانات...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md text-red-800 text-center">
        <p className="font-bold">خطأ</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* dir="rtl": Radix Tabs stamps dir="ltr" on its root when no dir is given,
          which flipped this whole dashboard to LTR — icons laid out left-to-right
          while the Arabic text stayed right-aligned, so every list row had its
          icon stranded on the far side of the card. */}
      <Tabs defaultValue="overview" dir="rtl" onValueChange={handleTabChange}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">النظرة العامة</TabsTrigger>
          <TabsTrigger value="statistics">الإحصائيات</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي المشاركين
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalParticipants || 0}</div>
                <p className="text-xs text-muted-foreground">
                  إجمالي عدد المشاركين المسجلين
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  عدد الفرق
                </CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalTeams || 0}</div>
                <p className="text-xs text-muted-foreground">
                  إجمالي عدد الفرق المسجلة
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  المشاركات الفردية
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.individualParticipants || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد المشاركين بدون فرق
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  عدد الموجهين
                </CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalMentors || 0}</div>
                <p className="text-xs text-muted-foreground">
                  إجمالي عدد الموجهين المسجلين
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي الفعاليات
                </CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalEvents || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد الفعاليات المخططة
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  الفعاليات المكتملة
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.completedEvents || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد الفعاليات التي تم إكمالها
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  الفعاليات القادمة
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.upcomingEvents || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد الفعاليات المستقبلية
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي التسجيلات
                </CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalEventRegistrations || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد التسجيلات في الفعاليات
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي التسليمات
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalSubmissions || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد تسليمات المراحل
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  التسليمات المقبولة
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.acceptedSubmissions || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد التسليمات المقبولة
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  التسليمات المعلقة
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingSubmissions || 0}</div>
                <p className="text-xs text-muted-foreground">
                  عدد التسليمات قيد المراجعة
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>الفعاليات القادمة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.upcomingEventsList && stats.upcomingEventsList.length > 0 ? (
                    stats.upcomingEventsList.map((event) => (
                      // gap-4 instead of ml-4: logical spacing that is correct in RTL and
                      // LTR. flex-1 + min-w-0 makes the text fill the row instead of
                      // shrink-wrapping against the icon and leaving the card half empty.
                      <div key={event.id} className="flex items-center gap-4">
                        <div className="bg-primary/10 p-2 rounded-full shrink-0">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-medium truncate">{event.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.startDate).toLocaleDateString('ar-SA', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })} - {new Date(event.startDate).toLocaleTimeString('ar-SA', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-[200px]">
                      <p className="text-muted-foreground">لا توجد فعاليات قادمة</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>آخر الإشعارات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats?.recentNotifications && stats.recentNotifications.length > 0 ? (
                    stats.recentNotifications.map((notification) => {
                      // Determine icon and color based on notification type
                      let IconComponent = Bell;
                      let bgColor = "bg-blue-100";
                      let textColor = "text-blue-600";
                      
                      if (notification.type === "success") {
                        IconComponent = CheckCircle;
                        bgColor = "bg-green-100";
                        textColor = "text-green-600";
                      } else if (notification.type === "warning") {
                        IconComponent = Trophy;
                        bgColor = "bg-yellow-100";
                        textColor = "text-yellow-600";
                      } else if (notification.type === "error") {
                        IconComponent = Calendar;
                        bgColor = "bg-red-100";
                        textColor = "text-red-600";
                      }
                      
                      // Calculate time ago
                      const createdAt = new Date(notification.createdAt);
                      const now = new Date();
                      const diffInHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
                      
                      let timeAgo;
                      if (diffInHours < 1) {
                        timeAgo = "منذ أقل من ساعة";
                      } else if (diffInHours < 24) {
                        timeAgo = `منذ ${diffInHours} ساعة`;
                      } else {
                        const diffInDays = Math.floor(diffInHours / 24);
                        timeAgo = `منذ ${diffInDays} يوم`;
                      }
                      
                      return (
                        // justify-between pushed the text to the far edge, away from its
                        // own icon; same gap/flex-1 treatment as the events card so the
                        // two cards in this row match.
                        <div key={notification.id} className="flex items-center gap-4">
                          <div className={`${bgColor} p-2 rounded-full shrink-0`}>
                            <IconComponent className={`h-4 w-4 ${textColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-medium truncate">{notification.title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {timeAgo}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-center h-[200px]">
                      <p className="text-muted-foreground">لا توجد إشعارات حديثة</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>أحدث التسليمات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.recentSubmissions && stats.recentSubmissions.length > 0 ? (
                  stats.recentSubmissions.map((submission) => {
                    // Determine status color
                    let statusColor = "text-yellow-600";
                    let statusText = "قيد المراجعة";
                    
                    if (submission.reviewStatus === "accepted") {
                      statusColor = "text-green-600";
                      statusText = "مقبول";
                    } else if (submission.reviewStatus === "rejected") {
                      statusColor = "text-red-600";
                      statusText = "مرفوض";
                    }
                    
                    // Calculate time ago
                    const submittedAt = new Date(submission.submittedAt);
                    const now = new Date();
                    const diffInHours = Math.floor((now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60));
                    
                    let timeAgo;
                    if (diffInHours < 1) {
                      timeAgo = "منذ أقل من ساعة";
                    } else if (diffInHours < 24) {
                      timeAgo = `منذ ${diffInHours} ساعة`;
                    } else {
                      const diffInDays = Math.floor(diffInHours / 24);
                      timeAgo = `منذ ${diffInDays} يوم`;
                    }
                    
                    return (
                      <div key={submission.id} className="flex items-center gap-4">
                        <div className="bg-primary/10 p-2 rounded-full shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between">
                            <h4 className="text-sm font-medium">{submission.milestoneTitle}</h4>
                            <span className={`text-sm font-medium ${statusColor}`}>{statusText}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {submission.teamName} - {timeAgo}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center h-[200px]">
                    <p className="text-muted-foreground">لا توجد تسليمات حديثة</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>إحصائيات المشاركة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">نسبة المشاركة في الفعاليات</span>
                    <span className="text-sm text-muted-foreground">
                      {stats?.totalEventRegistrations && stats?.totalParticipants
                        ? Math.round((stats.totalEventRegistrations / (stats.totalParticipants * Math.max(stats.totalEvents, 1))) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ 
                        width: `${stats?.totalEventRegistrations && stats?.totalParticipants && stats?.totalEvents
                          ? Math.min(100, (stats.totalEventRegistrations / (stats.totalParticipants * Math.max(stats.totalEvents, 1))) * 100)
                          : 0}%` 
                      }}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">نسبة اكتمال جلسات الإرشاد</span>
                    <span className="text-sm text-muted-foreground">
                      {stats?.completedMentorBookings && stats?.totalMentorBookings
                        ? Math.round((stats.completedMentorBookings / Math.max(stats.totalMentorBookings, 1)) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500" 
                      style={{ 
                        width: `${stats?.completedMentorBookings && stats?.totalMentorBookings
                          ? Math.min(100, (stats.completedMentorBookings / Math.max(stats.totalMentorBookings, 1)) * 100)
                          : 0}%` 
                      }}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">نسبة تسليم المراحل</span>
                    <span className="text-sm text-muted-foreground">
                      {stats?.totalSubmissions && stats?.totalTeams && stats?.milestones?.length
                        ? Math.round((stats.totalSubmissions / (stats.totalTeams * Math.max(stats.milestones.length, 1))) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500" 
                      style={{ 
                        width: `${stats?.totalSubmissions && stats?.totalTeams && stats?.milestones?.length
                          ? Math.min(100, (stats.totalSubmissions / (stats.totalTeams * Math.max(stats.milestones.length, 1))) * 100)
                          : 0}%` 
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>توزيع المشاركين</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <PieChart />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>توزيع الفرق حسب المسار</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <BarChart />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تسليمات المراحل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {stats?.milestones && stats.milestones.length > 0 ? (
                    <div className="space-y-4">
                      {stats.milestones.map((milestone) => (
                        <div key={milestone.id} className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">{milestone.title}</span>
                            <span className="text-sm text-muted-foreground">{milestone.submissionCount} تسليم</span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary" 
                              style={{ 
                                width: `${Math.min(100, (milestone.submissionCount / Math.max(stats.totalTeams, 1)) * 100)}%` 
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">لا توجد مراحل مسجلة</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>حالة التسليمات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <div className="flex flex-col h-full justify-center">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">التسليمات المقبولة</span>
                          <span className="text-sm text-muted-foreground">
                            {stats?.acceptedSubmissions || 0} من {stats?.totalSubmissions || 0}
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500" 
                            style={{ 
                              width: `${stats?.totalSubmissions ? (stats.acceptedSubmissions / stats.totalSubmissions) * 100 : 0}%` 
                            }}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">التسليمات المعلقة</span>
                          <span className="text-sm text-muted-foreground">
                            {stats?.pendingSubmissions || 0} من {stats?.totalSubmissions || 0}
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-yellow-500" 
                            style={{ 
                              width: `${stats?.totalSubmissions ? (stats.pendingSubmissions / stats.totalSubmissions) * 100 : 0}%` 
                            }}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">نسبة الإكمال</span>
                          <span className="text-sm text-muted-foreground">
                            {stats?.totalSubmissions && stats?.totalTeams && stats.milestones?.length
                              ? Math.round((stats.totalSubmissions / (stats.totalTeams * stats.milestones.length)) * 100)
                              : 0}%
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500" 
                            style={{ 
                              width: `${stats?.totalSubmissions && stats?.totalTeams && stats.milestones?.length
                                ? (stats.totalSubmissions / (stats.totalTeams * stats.milestones.length)) * 100
                                : 0}%` 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
