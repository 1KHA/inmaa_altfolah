"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Filter,
  MoreVertical,
  FileText,
  Download,
  Eye,
  UserPlus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Star,
  GitBranch,
  Link,
  Upload,
  Users,
  Trophy,
  BarChart,
} from "lucide-react";

// Mock data for submissions
const mockSubmissions = [
  {
    id: 1,
    projectName: "منصة الصحة الذكية",
    teamName: "فريق الابتكار",
    teamId: "TEAM001",
    category: "الصحة الرقمية",
    submittedAt: "2024-01-15 14:30",
    status: "قيد المراجعة",
    reviewProgress: 60,
    assignedJudges: 3,
    totalJudges: 5,
    averageScore: 4.2,
    githubUrl: "https://github.com/team001/health-platform",
    demoUrl: "https://demo.health-platform.com",
    files: [
      { name: "العرض التقديمي.pdf", size: "2.5 MB" },
      { name: "وثيقة المشروع.docx", size: "1.2 MB" },
    ],
    teamMembers: [
      { name: "أحمد محمد", role: "قائد الفريق" },
      { name: "فاطمة علي", role: "مطور" },
      { name: "عبدالله سالم", role: "مصمم" },
    ],
  },
  {
    id: 2,
    projectName: "تطبيق التعليم التفاعلي",
    teamName: "رواد التعليم",
    teamId: "TEAM002",
    category: "تقنيات التعليم",
    submittedAt: "2024-01-15 13:45",
    status: "مكتمل",
    reviewProgress: 100,
    assignedJudges: 5,
    totalJudges: 5,
    averageScore: 4.8,
    githubUrl: "https://github.com/team002/edu-app",
    demoUrl: "https://edu-app.demo.com",
    files: [
      { name: "العرض التقديمي.pdf", size: "3.1 MB" },
      { name: "دليل المستخدم.pdf", size: "1.8 MB" },
    ],
    teamMembers: [
      { name: "سارة أحمد", role: "قائد الفريق" },
      { name: "محمد خالد", role: "مطور" },
      { name: "نورا عبدالله", role: "محلل أعمال" },
    ],
  },
  {
    id: 3,
    projectName: "حلول الطاقة المستدامة",
    teamName: "الطاقة الخضراء",
    teamId: "TEAM003",
    category: "الاستدامة",
    submittedAt: "2024-01-15 12:20",
    status: "بانتظار المراجعة",
    reviewProgress: 0,
    assignedJudges: 0,
    totalJudges: 5,
    averageScore: 0,
    githubUrl: "https://github.com/team003/green-energy",
    demoUrl: "",
    files: [
      { name: "العرض التقديمي.pdf", size: "2.8 MB" },
    ],
    teamMembers: [
      { name: "خالد محمد", role: "قائد الفريق" },
      { name: "ليلى أحمد", role: "مهندس" },
      { name: "عمر سالم", role: "باحث" },
    ],
  },
  {
    id: 4,
    projectName: "منصة التجارة الإلكترونية",
    teamName: "رواد الأعمال",
    teamId: "TEAM004",
    category: "التجارة الإلكترونية",
    submittedAt: "2024-01-15 11:00",
    status: "مرفوض",
    reviewProgress: 100,
    assignedJudges: 5,
    totalJudges: 5,
    averageScore: 2.1,
    githubUrl: "https://github.com/team004/ecommerce",
    demoUrl: "https://ecommerce.demo.com",
    files: [
      { name: "العرض التقديمي.pdf", size: "1.9 MB" },
    ],
    teamMembers: [
      { name: "ياسر علي", role: "قائد الفريق" },
      { name: "هند محمد", role: "مطور" },
    ],
  },
];

const categories = [
  "جميع الفئات",
  "الصحة الرقمية",
  "تقنيات التعليم",
  "الاستدامة",
  "التجارة الإلكترونية",
  "الذكاء الاصطناعي",
  "إنترنت الأشياء",
];

const statusOptions = [
  "جميع الحالات",
  "بانتظار المراجعة",
  "قيد المراجعة",
  "مكتمل",
  "مرفوض",
];

export default function SubmissionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("جميع الفئات");
  const [selectedStatus, setSelectedStatus] = useState("جميع الحالات");
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "مكتمل":
        return "bg-green-100 text-green-800";
      case "قيد المراجعة":
        return "bg-blue-100 text-blue-800";
      case "بانتظار المراجعة":
        return "bg-yellow-100 text-yellow-800";
      case "مرفوض":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return "text-green-600";
    if (score >= 3) return "text-yellow-600";
    if (score >= 1) return "text-red-600";
    return "text-gray-400";
  };

  return (
    <div className="p-0 md:p-8" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">المشاريع المقدمة</h1>
        <p className="text-gray-600">إدارة ومراجعة المشاريع المقدمة للهاكاثون</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المشاريع</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">48</div>
            <p className="text-xs text-muted-foreground">+12 من الأسبوع الماضي</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">قيد المراجعة</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">15</div>
            <p className="text-xs text-muted-foreground">31% من المجموع</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مكتملة المراجعة</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">28</div>
            <p className="text-xs text-muted-foreground">58% من المجموع</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط التقييم</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4.2</div>
            <p className="text-xs text-muted-foreground">من 5.0</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="البحث عن مشروع أو فريق..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="الفئة" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline">
          <Filter className="ml-2 h-4 w-4" />
          المزيد من الفلاتر
        </Button>
      </div>

      {/* Submissions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المشروع</TableHead>
                <TableHead className="text-right">الفريق</TableHead>
                <TableHead className="text-right">الفئة</TableHead>
                <TableHead className="text-right">وقت التقديم</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">التقدم</TableHead>
                <TableHead className="text-right">التقييم</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockSubmissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div className="font-semibold">{submission.projectName}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                        {submission.githubUrl && (
                          <a href={submission.githubUrl} target="_blank" rel="noopener noreferrer">
                            <GitBranch className="h-3 w-3" />
                          </a>
                        )}
                        {submission.demoUrl && (
                          <a href={submission.demoUrl} target="_blank" rel="noopener noreferrer">
                            <Link className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{submission.teamName}</div>
                      <div className="text-sm text-gray-500">{submission.teamId}</div>
                    </div>
                  </TableCell>
                  <TableCell>{submission.category}</TableCell>
                  <TableCell>{submission.submittedAt}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(submission.status)}>
                      {submission.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={submission.reviewProgress} className="w-20" />
                      <span className="text-sm text-gray-500">
                        {submission.assignedJudges}/{submission.totalJudges}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {submission.averageScore > 0 ? (
                      <div className="flex items-center gap-1">
                        <Star className={`h-4 w-4 ${getScoreColor(submission.averageScore)}`} />
                        <span className={`font-semibold ${getScoreColor(submission.averageScore)}`}>
                          {submission.averageScore.toFixed(1)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSelectedSubmission(submission)}>
                          <Eye className="ml-2 h-4 w-4" />
                          عرض التفاصيل
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <UserPlus className="ml-2 h-4 w-4" />
                          تعيين محكمين
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="ml-2 h-4 w-4" />
                          تحميل الملفات
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <BarChart className="ml-2 h-4 w-4" />
                          عرض التقييمات
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Submission Details Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل المشروع</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-4">
                <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
                <TabsTrigger value="team">الفريق</TabsTrigger>
                <TabsTrigger value="files">الملفات</TabsTrigger>
                <TabsTrigger value="reviews">التقييمات</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">معلومات المشروع</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-500">اسم المشروع:</span>
                        <p className="font-medium">{selectedSubmission.projectName}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">الفئة:</span>
                        <p className="font-medium">{selectedSubmission.category}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">وقت التقديم:</span>
                        <p className="font-medium">{selectedSubmission.submittedAt}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">حالة المراجعة</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-500">الحالة:</span>
                        <Badge className={`mr-2 ${getStatusColor(selectedSubmission.status)}`}>
                          {selectedSubmission.status}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">التقدم:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={selectedSubmission.reviewProgress} className="flex-1" />
                          <span className="text-sm">{selectedSubmission.reviewProgress}%</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">المحكمين:</span>
                        <p className="font-medium">
                          {selectedSubmission.assignedJudges} من {selectedSubmission.totalJudges}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4">
                  <h3 className="font-semibold mb-2">الروابط</h3>
                  <div className="flex gap-4">
                    {selectedSubmission.githubUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedSubmission.githubUrl} target="_blank" rel="noopener noreferrer">
                          <GitBranch className="ml-2 h-4 w-4" />
                          GitHub
                        </a>
                      </Button>
                    )}
                    {selectedSubmission.demoUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedSubmission.demoUrl} target="_blank" rel="noopener noreferrer">
                          <Link className="ml-2 h-4 w-4" />
                          عرض تجريبي
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="team" className="space-y-4">
                <h3 className="font-semibold mb-2">أعضاء الفريق</h3>
                <div className="space-y-3">
                  {selectedSubmission.teamMembers.map((member: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Avatar>
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-gray-500">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="files" className="space-y-4">
                <h3 className="font-semibold mb-2">الملفات المرفوعة</h3>
                <div className="space-y-2">
                  {selectedSubmission.files.map((file: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-gray-500">{file.size}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full">
                  <Upload className="ml-2 h-4 w-4" />
                  رفع ملف إضافي
                </Button>
              </TabsContent>
              
              <TabsContent value="reviews" className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">التقييمات</h3>
                  {selectedSubmission.averageScore > 0 && (
                    <div className="flex items-center gap-2">
                      <Star className={`h-5 w-5 ${getScoreColor(selectedSubmission.averageScore)}`} />
                      <span className={`text-xl font-bold ${getScoreColor(selectedSubmission.averageScore)}`}>
                        {selectedSubmission.averageScore.toFixed(1)}
                      </span>
                      <span className="text-gray-500">/ 5.0</span>
                    </div>
                  )}
                </div>
                
                {selectedSubmission.averageScore > 0 ? (
                  <div className="space-y-3">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>م.أ</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">محمد أحمد</p>
                            <p className="text-sm text-gray-500">محكم</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">4.5</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        مشروع مبتكر مع تنفيذ جيد. يحتاج إلى بعض التحسينات في واجهة المستخدم.
                      </p>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>س.ع</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">سارة عبدالله</p>
                            <p className="text-sm text-gray-500">محكم</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">3.9</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        فكرة جيدة ولكن التنفيذ يحتاج إلى المزيد من العمل. الوثائق ممتازة.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                    <p>لم يتم تقييم هذا المشروع بعد</p>
                    <Button className="mt-4">
                      <UserPlus className="ml-2 h-4 w-4" />
                      تعيين محكمين
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
