'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Phone, Briefcase, Calendar, Clock, UserCheck, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/../../components/ui/use-toast';

interface Mentor {
  id: string;
  name: string;
  email: string;
  specialty: string;
  phone: string;
  status: 'pending' | 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

function MentorProfile() {
  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', specialty: '', phone: '' });
  const { toast } = useToast();

  useEffect(() => {
    const fetchMentor = async () => {
      try {
        const response = await fetch(`/api/mentor/me`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch mentor data');
        }
        const data = await response.json();
        setMentor(data);
        setFormData({
          name: data.name,
          email: data.email,
          specialty: data.specialty,
          phone: data.phone,
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMentor();
  }, []);

  const handleUpdate = async () => {
    if (!mentor) return;

    try {
      const response = await fetch(`/api/mentor/update-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }

      const updatedMentor = await response.json();
      setMentor(updatedMentor);
      toast({
        title: 'نجاح',
        description: 'تم تحديث ملفك الشخصي بنجاح.',
      });
    } catch (err: any) {
      toast({
        title: 'خطأ',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">نشط</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">بانتظار التفعيل</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800">غير نشط</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="p-8 text-center">جاري تحميل بيانات الموجه...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600" dir="rtl">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>خطأ</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!mentor) {
    return (
        <div className="p-8 text-center" dir="rtl">
            <Card className="max-w-lg mx-auto">
                <CardHeader>
                    <CardTitle>لم يتم العثور على الموجه</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>لم نتمكن من العثور على بيانات الموجه المطلوب.</p>
                </CardContent>
            </Card>
        </div>
    );
  }

  if (mentor.status !== 'active') {
    return (
      <div className="p-8 text-center" dir="rtl">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>الحساب غير نشط</CardTitle>
          </CardHeader>
          <CardContent>
            <p>حساب الموجه هذا ليس نشطًا حاليًا. لا يمكن عرض الملف الشخصي.</p>
            <div className="mt-4">
                {getStatusBadge(mentor.status)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-0 md:p-8" dir="rtl">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="flex flex-col md:flex-row items-center gap-6 space-y-0">
          <Avatar className="h-24 w-24">
            <AvatarImage src={`https://api.dicebear.com/8.x/initials/svg?seed=${mentor.name}`} />
            <AvatarFallback>{mentor.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-right">
            <CardTitle className="text-3xl font-bold">{mentor.name}</CardTitle>
            <CardDescription className="text-lg text-muted-foreground">{mentor.specialty}</CardDescription>
            <div className="mt-2">
                {getStatusBadge(mentor.status)}
            </div>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="ml-auto">
                <Edit className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>تعديل الملف الشخصي</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم</Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialty">التخصص</Label>
                  <Input id="specialty" value={formData.specialty} onChange={(e) => setFormData({ ...formData, specialty: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الجوال</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">إلغاء</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button type="submit" onClick={handleUpdate}>حفظ التغييرات</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              <Mail className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                <p className="font-medium">{mentor.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Phone className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">رقم الجوال</p>
                <p className="font-medium">{mentor.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Briefcase className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">التخصص</p>
                <p className="font-medium">{mentor.specialty}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <UserCheck className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">الحالة</p>
                <p className="font-medium">
                    {mentor.status === 'active' ? 'نشط' : (mentor.status === 'pending' ? 'بانتظار التفعيل' : 'غير نشط')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Calendar className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">تاريخ الإنشاء</p>
                <p className="font-medium">{new Date(mentor.createdAt).toLocaleDateString('ar-SA')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Clock className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-muted-foreground">آخر تحديث</p>
                <p className="font-medium">{new Date(mentor.updatedAt).toLocaleDateString('ar-SA')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MentorProfilePage() {
    return (
        <Suspense fallback={<div className="p-8 text-center">جاري التحميل...</div>}>
            <MentorProfile />
        </Suspense>
    );
}
