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
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Filter,
  Download,
  Trash,
  Edit,
  Eye,
  MoreHorizontal,
  Plus,
  Star,
  BarChart
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function JudgesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newJudge, setNewJudge] = useState({
    name: "",
    email: "",
    phone: "",
    specialty: "",
    organization: "",
  });

  // Mock data for judges
  const judges = [
    {
      id: 1,
      name: "د. محمد العمري",
      email: "m.alomari@example.com",
      phone: "0501234567",
      specialty: "الذكاء الاصطناعي",
      organization: "جامعة الملك سعود",
      status: "مؤكد",
      rating: 4.8,
    },
    {
      id: 2,
      name: "د. سارة الأحمد",
      email: "s.alahmad@example.com",
      phone: "0507654321",
      specialty: "علوم البيانات",
      organization: "شركة أرامكو",
      status: "مؤكد",
      rating: 4.9,
    },
    {
      id: 3,
      name: "د. خالد المنصور",
      email: "k.almansour@example.com",
      phone: "0509876543",
      specialty: "تطوير البرمجيات",
      organization: "شركة مايكروسوفت",
      status: "مؤكد",
      rating: 4.7,
    },
    {
      id: 4,
      name: "د. نورة القحطاني",
      email: "n.alqahtani@example.com",
      phone: "0503456789",
      specialty: "تجربة المستخدم",
      organization: "جامعة الأميرة نورة",
      status: "بانتظار التأكيد",
      rating: 4.5,
    },
    {
      id: 5,
      name: "د. فهد الشمري",
      email: "f.alshammari@example.com",
      phone: "0508765432",
      specialty: "أمن المعلومات",
      organization: "هيئة الاتصالات وتقنية المعلومات",
      status: "بانتظار التأكيد",
      rating: 4.6,
    },
  ];

  // Filter judges based on search query and selected filter
  const filteredJudges = judges.filter((judge) => {
    const matchesSearch =
      judge.name.includes(searchQuery) ||
      judge.email.includes(searchQuery) ||
      judge.specialty.includes(searchQuery) ||
      judge.organization.includes(searchQuery);

    const matchesFilter =
      selectedFilter === "all" ||
      (selectedFilter === "confirmed" && judge.status === "مؤكد") ||
      (selectedFilter === "pending" && judge.status === "بانتظار التأكيد");

    return matchesSearch && matchesFilter;
  });

  const handleAddJudge = () => {
    // In a real application, this would send data to the server
    console.log("Adding new judge:", newJudge);
    setIsAddDialogOpen(false);
    setNewJudge({
      name: "",
      email: "",
      phone: "",
      specialty: "",
      organization: "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">الحكام</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              إضافة حكم
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة حكم جديد</DialogTitle>
              <DialogDescription>
                أدخل معلومات الحكم الجديد. اضغط على حفظ عند الانتهاء.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                <label htmlFor="name" className="text-right">
                  الاسم
                </label>
                <Input
                  id="name"
                  value={newJudge.name}
                  onChange={(e) =>
                    setNewJudge({ ...newJudge, name: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                <label htmlFor="email" className="text-right">
                  البريد الإلكتروني
                </label>
                <Input
                  id="email"
                  type="email"
                  value={newJudge.email}
                  onChange={(e) =>
                    setNewJudge({ ...newJudge, email: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                <label htmlFor="phone" className="text-right">
                  رقم الهاتف
                </label>
                <Input
                  id="phone"
                  value={newJudge.phone}
                  onChange={(e) =>
                    setNewJudge({ ...newJudge, phone: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                <label htmlFor="specialty" className="text-right">
                  التخصص
                </label>
                <Input
                  id="specialty"
                  value={newJudge.specialty}
                  onChange={(e) =>
                    setNewJudge({ ...newJudge, specialty: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                <label htmlFor="organization" className="text-right">
                  المنظمة
                </label>
                <Input
                  id="organization"
                  value={newJudge.organization}
                  onChange={(e) =>
                    setNewJudge({ ...newJudge, organization: e.target.value })
                  }
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleAddJudge}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الحكام</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row justify-between mb-6 gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="بحث عن حكم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-64 py-2 pr-10 pl-4 rounded-md border border-input bg-background text-right"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-right"
              >
                <option value="all">جميع الحكام</option>
                <option value="confirmed">المؤكدين</option>
                <option value="pending">بانتظار التأكيد</option>
              </select>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                تصفية
              </Button>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                تصدير
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>التخصص</TableHead>
                  <TableHead>المنظمة</TableHead>
                  <TableHead>التقييم</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJudges.map((judge) => (
                  <TableRow key={judge.id}>
                    <TableCell className="font-medium">{judge.name}</TableCell>
                    <TableCell>{judge.email}</TableCell>
                    <TableCell>{judge.specialty}</TableCell>
                    <TableCell>{judge.organization}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-400 mr-1" />
                        <span>{judge.rating}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          judge.status === "مؤكد" ? "success" : "warning"
                        }
                      >
                        {judge.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="h-8 w-8 p-0"
                          >
                            <span className="sr-only">فتح القائمة</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="ml-2 h-4 w-4" />
                            عرض التفاصيل
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="ml-2 h-4 w-4" />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <BarChart className="ml-2 h-4 w-4" />
                            عرض التقييمات
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash className="ml-2 h-4 w-4" />
                            حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 text-sm text-muted-foreground text-center">
            إجمالي الحكام: {judges.length} | تم العرض:{" "}
            {filteredJudges.length}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">إحصائيات الحكام</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الحكام</span>
                <span className="font-medium">{judges.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الحكام المؤكدين</span>
                <span className="font-medium">
                  {judges.filter((judge) => judge.status === "مؤكد").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">بانتظار التأكيد</span>
                <span className="font-medium">
                  {
                    judges.filter(
                      (judge) => judge.status === "بانتظار التأكيد"
                    ).length
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">متوسط التقييم</span>
                <span className="font-medium">
                  {(
                    judges.reduce((acc, judge) => acc + judge.rating, 0) /
                    judges.length
                  ).toFixed(1)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">التخصصات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الذكاء الاصطناعي</span>
                <span className="font-medium">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">علوم البيانات</span>
                <span className="font-medium">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تطوير البرمجيات</span>
                <span className="font-medium">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تجربة المستخدم</span>
                <span className="font-medium">1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">أمن المعلومات</span>
                <span className="font-medium">1</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">المنظمات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">جامعات</span>
                <span className="font-medium">2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">شركات تقنية</span>
                <span className="font-medium">2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">هيئات حكومية</span>
                <span className="font-medium">1</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
