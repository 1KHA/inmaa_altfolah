'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Filter, 
  Download, 
  UserPlus,
  MoreHorizontal,
  Users,
  Mail,
  Calendar,
  Clock,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Ban,
  RotateCcw,
  Video,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '../../../../components/ui/use-toast';
import MentorMessageDialog from '@/components/admin/MentorMessageDialog';
import { Label } from '@/components/ui/label';
import { Calendar as BigCalendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ar'; // Import Arabic locale
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { SLOT_STEP_MINUTES, SLOT_TIMESLOTS_PER_HOUR } from '@/lib/constants';

moment.locale('ar'); // Set moment to use Arabic
const localizer = momentLocalizer(moment);

const messages = {
  allDay: 'يوم كامل',
  previous: 'السابق',
  next: 'التالي',
  today: 'اليوم',
  month: 'شهر',
  week: 'أسبوع',
  day: 'يوم',
  agenda: 'أجندة',
  date: 'تاريخ',
  time: 'وقت',
  event: 'حدث',
  showMore: (total: number) => `+${total} المزيد`,
};

interface AvailabilityEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
}

// Define the Mentor type
interface Mentor {
  id: string;
  name: string;
  email: string;
  specialty: string;
  phone: string;
  status: 'pending' | 'active' | 'inactive';
  isDisabled?: boolean;
  createdAt: string;
  updatedAt: string;
  // Computed server-side from real bookings/availability (see
  // GET /api/admin/mentors). Absent for non-admin callers.
  assignedTeams?: number;      // distinct teams this mentor has sessions with
  availability?: string | null; // متاح | متاح جزئياً | مشغول, from FUTURE slots
  sessionsCompleted?: number;  // non-cancelled bookings whose slot has ended
  sessionsUpcoming?: number;
  sessionsTotal?: number;
  availableSlots?: number;
  upcomingSlots?: number;
  teams?: string[];
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  // Bulk disable/enable selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mentorToEdit, setMentorToEdit] = useState<Mentor | null>(null);
  const [mentorToDelete, setMentorToDelete] = useState<Mentor | null>(null);
  const [isAvailabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [mentorForAvailability, setMentorForAvailability] = useState<Mentor | null>(null);
  const [availabilityEvents, setAvailabilityEvents] = useState<AvailabilityEvent[]>([]);
  const [slotToAdd, setSlotToAdd] = useState<{ start: Date; end: Date } | null>(null);
  const [mentorToMessage, setMentorToMessage] = useState<Mentor | null>(null);
  const [eventToDelete, setEventToDelete] = useState<AvailabilityEvent | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [newMentor, setNewMentor] = useState({
    name: '',
    email: '',
    specialty: '',
    phone: '',
    password: '',
  });
  const [generatedPassword, setGeneratedPassword] = useState('');
  // Id of the mentor whose status is currently being toggled from the table row,
  // so that row's button can show a spinner state and reject double clicks.
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMentorAvailability = async (mentorId: string) => {
    try {
      const response = await fetch(`/api/admin/mentors/${mentorId}/availability`);
      if (response.ok) {
        const data = await response.json();
        const formattedEvents = data.map((avail: any) => ({
          id: avail.id,
          start: new Date(avail.startTime),
          end: new Date(avail.endTime),
          title: 'Available',
        }));
        setAvailabilityEvents(formattedEvents);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch mentor availability.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while fetching availability.",
        variant: "destructive",
      })
    }
  };

  const handleAddAvailability = async () => {
    if (!mentorForAvailability || !slotToAdd) return;

    try {
      const response = await fetch(`/api/admin/mentors/${mentorForAvailability.id}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: slotToAdd.start, end: slotToAdd.end }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Availability added successfully.',
        });
        fetchMentorAvailability(mentorForAvailability.id); // Refresh events
      } else {
        throw new Error('Failed to add availability');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred while adding availability.',
        variant: 'destructive',
      });
    } finally {
      setSlotToAdd(null);
    }
  };

  const handleDeleteAvailability = async () => {
    if (!mentorForAvailability || !eventToDelete) return;

    try {
      const response = await fetch(`/api/admin/mentors/${mentorForAvailability.id}/availability`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilityId: eventToDelete.id }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Availability removed successfully.',
        });
        fetchMentorAvailability(mentorForAvailability.id); // Refresh events
      } else {
        throw new Error('Failed to remove availability');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred while removing availability.',
        variant: 'destructive',
      });
    } finally {
      setEventToDelete(null);
    }
  };

  const handleDateChange = (newDate: Date) => {
    setCalendarDate(newDate);
  };

  const fetchMentors = async () => {
    try {
      const response = await fetch('/api/admin/mentors');
      if (!response.ok) {
        throw new Error('Failed to fetch mentors');
      }
      const data = await response.json();
      // assignedTeams / availability / sessions now come from the API, computed
      // from real bookings and availability slots. They used to be generated
      // here with Math.random() and re-rolled on every fetch.
      setMentors(data);
    } catch (error) {
      console.error(error);
      toast({
        title: 'خطأ',
        description: 'فشل في جلب قائمة الموجهين.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchMentors();
  }, []);

  const handleAddMentor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/mentors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMentor),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add mentor');
      }

      const addedMentor = await response.json();
      toast({
        title: 'نجاح',
        description: `تمت إضافة الموجه بنجاح. كلمة المرور الافتراضية: ${newMentor.password}`,
      });
      setAddDialogOpen(false);
      setNewMentor({ name: '', email: '', specialty: '', phone: '', password: '' });
      fetchMentors(); // Refresh the list
    } catch (error: any) {
      toast({
        title: 'خطأ',
        description: error.message || 'فشل في إضافة الموجه.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateMentor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentorToEdit) return;

    try {
      const response = await fetch('/api/admin/mentors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mentorToEdit),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update mentor');
      }

      toast({
        title: 'نجاح',
        description: 'تم تحديث بيانات الموجه بنجاح.',
      });
      setEditDialogOpen(false);
      setMentorToEdit(null);
      fetchMentors(); // Refresh the list
    } catch (error: any) {
      toast({
        title: 'خطأ',
        description: error.message || 'فشل في تحديث بيانات الموجه.',
        variant: 'destructive',
      });
    }
  };

  /**
   * One-click activate / deactivate straight from the table row, so approving a
   * mentor no longer means "⋯ → تعديل المعلومات → الحالة → حفظ".
   *
   * Only `status` is sent: Prisma skips `undefined` fields, so the mentor's
   * name/email/specialty/phone are left untouched. Switching to 'active' goes
   * through the same PUT the edit dialog uses, so the mentorProfileApproval
   * notification still fires on the pending → active transition.
   */
  const handleToggleMentorStatus = async (mentor: Mentor) => {
    const nextStatus = mentor.status === 'active' ? 'inactive' : 'active';
    setStatusUpdatingId(mentor.id);
    try {
      const response = await fetch('/api/admin/mentors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mentor.id, status: nextStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update mentor status');
      }

      // Patch the single row instead of refetching — cheaper than a round trip,
      // and the stats are unaffected by a status change.
      setMentors((prev) =>
        prev.map((m) => (m.id === mentor.id ? { ...m, status: nextStatus } : m))
      );

      toast({
        title: 'نجاح',
        description:
          nextStatus === 'active'
            ? `تم تفعيل حساب الموجه ${mentor.name}.`
            : `تم إلغاء تفعيل حساب الموجه ${mentor.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'خطأ',
        description: error.message || 'فشل في تحديث حالة الموجه.',
        variant: 'destructive',
      });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteMentor = async () => {
    if (!mentorToDelete) return;

    try {
      const response = await fetch('/api/admin/mentors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mentorToDelete.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete mentor');
      }

      toast({
        title: 'نجاح',
        description: 'تم إزالة الموجه بنجاح.',
      });
      setDeleteDialogOpen(false);
      setMentorToDelete(null);
      fetchMentors(); // Refresh the list
    } catch (error: any) {
      toast({
        title: 'خطأ',
        description: error.message || 'فشل في إزالة الموجه.',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (mentor: Mentor) => {
    setMentorToEdit(mentor);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (mentor: Mentor) => {
    setMentorToDelete(mentor);
    setDeleteDialogOpen(true);
  };

  const openAvailabilityDialog = (mentor: Mentor) => {
    setMentorForAvailability(mentor);
    fetchMentorAvailability(mentor.id);
    setAvailabilityDialogOpen(true);
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Disable or re-enable every ticked mentor in one request. */
  const handleBulkDisable = async (disabled: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      setBulkBusy(true);
      const res = await fetch('/api/admin/accounts/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mentorIds: Array.from(selectedIds), disabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تنفيذ العملية');
      toast({
        title: 'نجح',
        description: disabled
          ? `تم تعطيل ${data.mentorsUpdated} موجه`
          : `تم تفعيل ${data.mentorsUpdated} موجه`,
      });
      setSelectedIds(new Set());
      fetchMentors();
    } catch (err) {
      toast({
        title: 'خطأ',
        description: err instanceof Error ? err.message : 'فشل تنفيذ العملية',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const filteredMentors = mentors.filter(mentor => {
    const matchesSearch = mentor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mentor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mentor.specialty.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || mentor.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

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

  const getAvailabilityBadge = (availability?: string | null) => {
    switch (availability) {
      case 'متاح':
        return <Badge className="bg-green-100 text-green-800">متاح</Badge>;
      case 'مشغول':
        return <Badge className="bg-red-100 text-red-800">مشغول</Badge>;
      case 'متاح جزئياً':
        return <Badge className="bg-yellow-100 text-yellow-800">متاح جزئياً</Badge>;
      default:
        return null;
    }
  };

  // --- Admin Mentor Bookings Management State ---
  interface Booking {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    meetingUrl?: string | null;
    mentor: { id: string; name: string; email: string; specialty: string };
    participant: { id: string; name: string; email: string; phoneNumber: string };
    availability: { id: string; startTime: string; endTime: string };
  }
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isEditBookingDialogOpen, setEditBookingDialogOpen] = useState(false);
  const [isDeleteBookingDialogOpen, setDeleteBookingDialogOpen] = useState(false);
  const [editBookingStatus, setEditBookingStatus] = useState('');
  const [editBookingAvailabilityId, setEditBookingAvailabilityId] = useState('');
  const [editBookingLoading, setEditBookingLoading] = useState(false);
  const [deleteBookingLoading, setDeleteBookingLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<{ id: string; startTime: string; endTime: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Fetch all bookings for admin
  const fetchBookings = async () => {
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      // Always use the admin API endpoint first for admin dashboard
      const res = await fetch('/api/admin/mentor-bookings');
      
      if (!res.ok) {
        // Check if it's an authentication/authorization error
        if (res.status === 401 || res.status === 403) {
          throw new Error('غير مصرح. هذه الخدمة متاحة للمسؤولين فقط. يرجى إعادة تسجيل الدخول كمسؤول.');
        }
        throw new Error('فشل في جلب الحجوزات');
      }
      
      const data = await res.json();
      setBookings(data);
    } catch (err: any) {
      console.error('Error fetching bookings:', err);
      setBookingsError(err.message || 'حدث خطأ أثناء جلب الحجوزات');
      
      // Show a toast with the error message
      toast({
        title: 'خطأ',
        description: err.message || 'حدث خطأ أثناء جلب الحجوزات',
        variant: 'destructive',
      });
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Edit booking dialog open
  const openEditBookingDialog = async (booking: Booking) => {
    setSelectedBooking(booking);
    setEditBookingStatus(booking.status);
    setEditBookingAvailabilityId(booking.availability.id);
    setEditBookingDialogOpen(true);

    // Fetch available slots for this mentor
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/admin/mentors/${booking.mentor.id}/availability`);
      if (!res.ok) throw new Error('فشل في جلب المواعيد المتاحة');
      const data = await res.json();
      setAvailableSlots(data);
    } catch (err) {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // Delete booking dialog open
  const openDeleteBookingDialog = (booking: Booking) => {
    setSelectedBooking(booking);
    setDeleteBookingDialogOpen(true);
  };

  // Handle edit booking submit
  const handleEditBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    setEditBookingLoading(true);
    try {
      const res = await fetch(`/api/admin/mentor-bookings/${selectedBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editBookingStatus,
          availabilityId: editBookingAvailabilityId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل في تحديث الحجز');
      }
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث بيانات الحجز بنجاح.',
      });
      setEditBookingDialogOpen(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (err: any) {
      toast({
        title: 'خطأ',
        description: err.message || 'حدث خطأ أثناء تحديث الحجز.',
        variant: 'destructive',
      });
    } finally {
      setEditBookingLoading(false);
    }
  };

  // Handle delete booking
  const handleDeleteBooking = async () => {
    if (!selectedBooking) return;
    setDeleteBookingLoading(true);
    try {
      const res = await fetch(`/api/admin/mentor-bookings/${selectedBooking.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل في حذف الحجز');
      }
      toast({
        title: 'تم الحذف',
        description: 'تم حذف الحجز بنجاح.',
      });
      setDeleteBookingDialogOpen(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (err: any) {
      toast({
        title: 'خطأ',
        description: err.message || 'حدث خطأ أثناء حذف الحجز.',
        variant: 'destructive',
      });
    } finally {
      setDeleteBookingLoading(false);
    }
  };

  return (
    <div className="p-0 md:p-8" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <h1 className="text-3xl font-bold text-blue-800">إدارة الموجهين</h1>
        <div className="flex gap-4">
          <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 rounded-full">
                <UserPlus className="ml-2 h-4 w-4" />
                إضافة موجه جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-lg border-0 shadow-lg">
              <DialogHeader>
                <DialogTitle>إضافة موجه جديد</DialogTitle>
                <DialogDescription>
                  أدخل تفاصيل الموجه الجديد. سيتم إرسال دعوة له عبر البريد الإلكتروني.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddMentor}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="name" className="text-right">
                      الاسم
                    </Label>
                    <Input
                      id="name"
                      value={newMentor.name}
                      onChange={(e) => setNewMentor({ ...newMentor, name: e.target.value })}
                      className="col-span-3"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="email" className="text-right">
                      البريد الإلكتروني
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={newMentor.email}
                      onChange={(e) => setNewMentor({ ...newMentor, email: e.target.value })}
                      className="col-span-3"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="specialty" className="text-right">
                      التخصص
                    </Label>
                    <Input
                      id="specialty"
                      value={newMentor.specialty}
                      onChange={(e) => setNewMentor({ ...newMentor, specialty: e.target.value })}
                      className="col-span-3"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="phone" className="text-right">
                      رقم الجوال
                    </Label>
                    <Input
                      id="phone"
                      value={newMentor.phone}
                      onChange={(e) => setNewMentor({ ...newMentor, phone: e.target.value })}
                      className="col-span-3"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                    <Label htmlFor="password" className="text-right">
                      كلمة المرور
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={newMentor.password}
                      onChange={(e) => setNewMentor({ ...newMentor, password: e.target.value })}
                      className="col-span-3"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 rounded-full">إضافة الموجه</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="rounded-full border-blue-200 hover:bg-blue-50">
            <Download className="ml-2 h-4 w-4 text-blue-600" />
            تصدير القائمة
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              إجمالي الموجهين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{mentors.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">{mentors.filter(m => m.status === 'active').length} نشط</span>، 
              <span className="text-yellow-600 font-medium"> {mentors.filter(m => m.status === 'pending').length} بانتظار</span>
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              الجلسات المكتملة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {mentors.reduce((total, mentor) => total + (mentor.sessionsCompleted || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              معدل {(mentors.reduce((total, mentor) => total + (mentor.sessionsCompleted || 0), 0) / (mentors.length || 1)).toFixed(1)} جلسة لكل موجه
            </p>
          </CardContent>
        </Card>
        
        {/* Replaced "متوسط التقييم": there is no rating model in the schema, so
            the old average was a mean of Math.random() values. This shows a
            real number instead. */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-5 w-5 text-yellow-500" />
              الفرق المخدومة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {new Set(mentors.flatMap((m) => m.teams || [])).size}
            </div>
            <p className="text-xs text-muted-foreground">
              عدد الفرق التي لديها جلسات مع الموجهين
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-purple-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-500" />
              حالة التوفر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {mentors.filter(m => m.availability === 'متاح').length}
            </div>
            <p className="text-xs text-muted-foreground">
              موجه متاح حالياً للمساعدة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="mb-8 border-0 shadow-sm overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500 h-4 w-4" />
                <Input
                  placeholder="البحث بالاسم، البريد الإلكتروني، أو التخصص..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10 border-blue-100 focus:border-blue-300 rounded-full"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[180px] border-blue-100 focus:border-blue-300 rounded-full">
                <SelectValue placeholder="حالة الموجه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="pending">بانتظار التفعيل</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="rounded-full border-blue-200 hover:bg-blue-50">
              <Filter className="ml-2 h-4 w-4 text-blue-500" />
              المزيد من الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk disable/enable bar — appears once any mentor is ticked */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm font-medium">تم اختيار {selectedIds.size} موجه</span>
          <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => handleBulkDisable(true)}>
            <Ban className="ml-1 h-4 w-4" />
            تعطيل المحدد
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulkDisable(false)}>
            <RotateCcw className="ml-1 h-4 w-4" />
            إعادة التفعيل
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      {/* Mentors Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table className="border-collapse">
            <TableHeader>
              <TableRow className="bg-blue-50 hover:bg-blue-50">
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="تحديد الكل"
                    checked={filteredMentors.length > 0 && filteredMentors.every((m) => selectedIds.has(m.id))}
                    onCheckedChange={(checked: boolean | 'indeterminate') =>
                      setSelectedIds(checked === true ? new Set(filteredMentors.map((m) => m.id)) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>التخصص</TableHead>
                <TableHead>الفرق المعينة</TableHead>
                <TableHead>التوفر</TableHead>
                <TableHead>الجلسات</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMentors.map((mentor) => (
                <TableRow
                  key={mentor.id}
                  className={`hover:bg-gray-50 transition-colors duration-150 ${mentor.isDisabled ? 'bg-red-50/60' : ''}`}
                >
                  <TableCell>
                    <Checkbox
                      aria-label="تحديد الموجه"
                      checked={selectedIds.has(mentor.id)}
                      onCheckedChange={() => toggleRow(mentor.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{mentor.name}</span>
                      {mentor.isDisabled && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700">معطل</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{mentor.email}</div>
                  </TableCell>
                  <TableCell>{mentor.specialty}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-gray-500" />
                      <span title={(mentor.teams || []).join('، ') || 'لا توجد فرق'}>
                        {mentor.assignedTeams ?? 0} فرق
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{getAvailabilityBadge(mentor.availability)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span title={`مكتملة ${mentor.sessionsCompleted ?? 0} · قادمة ${mentor.sessionsUpcoming ?? 0}`}>
                        {mentor.sessionsCompleted ?? 0}
                        {(mentor.sessionsUpcoming ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground"> (+{mentor.sessionsUpcoming} قادمة)</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(mentor.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      {mentor.status === 'active' ? (
                        <Button
                          variant="outline"
                          className="bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200 flex items-center gap-1"
                          disabled={statusUpdatingId === mentor.id}
                          onClick={() => handleToggleMentorStatus(mentor)}
                        >
                          <UserX className="h-4 w-4" />
                          <span>
                            {statusUpdatingId === mentor.id ? 'جاري الحفظ...' : 'إلغاء التفعيل'}
                          </span>
                        </Button>
                      ) : (
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                          disabled={statusUpdatingId === mentor.id}
                          onClick={() => handleToggleMentorStatus(mentor)}
                        >
                          <UserCheck className="h-4 w-4" />
                          <span>
                            {statusUpdatingId === mentor.id ? 'جاري التفعيل...' : 'تفعيل'}
                          </span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 flex items-center gap-1"
                        onClick={() => openAvailabilityDialog(mentor)}
                      >
                        <Clock className="h-4 w-4" />
                        <span>إدارة الوقت</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-200 flex items-center gap-1"
                        onClick={() => setMentorToMessage(mentor)}
                      >
                        <Mail className="h-4 w-4" />
                        <span>إرسال رسالة</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">فتح القائمة</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => setSelectedMentor(mentor)}>
                            <Users className="ml-2 h-4 w-4" />
                            عرض التفاصيل
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openEditDialog(mentor)}>
                            <Edit className="ml-2 h-4 w-4" />
                            تعديل المعلومات
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onSelect={() => openDeleteDialog(mentor)}
                          >
                            <Trash2 className="ml-2 h-4 w-4" />
                            إزالة الموجه
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- Admin Mentor Bookings Management Box --- */}
      <Card className="border-0 shadow-sm overflow-hidden mt-12">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-blue-800">جميع حجوزات الموجهين</CardTitle>
          <Button 
            variant="outline" 
            className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
            onClick={fetchBookings}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>
            تحديث
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {bookingsLoading ? (
            <div className="p-8 text-center text-blue-600">جاري تحميل الحجوزات...</div>
          ) : bookingsError ? (
            <div className="p-8 text-center text-red-600">{bookingsError}</div>
          ) : bookings.length === 0 ? (
            <div className="p-8 text-center text-gray-500">لا توجد حجوزات حالياً.</div>
          ) : (
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="bg-blue-50 hover:bg-blue-50">
                  <TableHead>الموجه</TableHead>
                  <TableHead>المشارك</TableHead>
                  <TableHead>البريد الإلكتروني للمشارك</TableHead>
                  <TableHead>رقم الجوال</TableHead>
                  <TableHead>التخصص</TableHead>
                  <TableHead>تاريخ الجلسة</TableHead>
                  <TableHead>الوقت</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <TableCell>
                      <div>{booking.mentor.name}</div>
                      <div className="text-xs text-gray-500">{booking.mentor.email}</div>
                    </TableCell>
                    <TableCell>{booking.participant.name}</TableCell>
                    <TableCell>{booking.participant.email}</TableCell>
                    <TableCell>{booking.participant.phoneNumber}</TableCell>
                    <TableCell>{booking.mentor.specialty}</TableCell>
                    <TableCell>
                      {new Date(booking.availability.startTime).toLocaleDateString('ar-EG')}
                    </TableCell>
                    <TableCell>
                      {`${new Date(booking.availability.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} - ${new Date(booking.availability.endTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        booking.status === 'booked'
                          ? 'bg-blue-100 text-blue-800'
                          : booking.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }>
                        {booking.status === 'booked'
                          ? 'محجوز'
                          : booking.status === 'completed'
                          ? 'مكتمل'
                          : 'ملغي'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-center">
                        {booking.meetingUrl && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200 flex items-center gap-1 px-3 py-1 h-8"
                            title="رابط اجتماع الجلسة"
                          >
                            <a href={booking.meetingUrl} target="_blank" rel="noopener noreferrer">
                              <Video className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 flex items-center gap-1 px-3 py-1 h-8"
                          onClick={() => openEditBookingDialog(booking)}
                        >
                          <Edit className="h-4 w-4" />
                          <span className="mr-1">تعديل</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200 flex items-center gap-1 px-3 py-1 h-8"
                          onClick={() => openDeleteBookingDialog(booking)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="mr-1">حذف</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Booking Dialog */}
      <Dialog open={isEditBookingDialogOpen} onOpenChange={setEditBookingDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الحجز</DialogTitle>
            <DialogDescription>
              قم بتحديث حالة الحجز أو إعادة جدولة الجلسة.
            </DialogDescription>
          </DialogHeader>
          {selectedBooking && (
            <form onSubmit={handleEditBooking}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-status" className="text-right">
                    الحالة
                  </Label>
                  <Select
                    value={editBookingStatus}
                    onValueChange={setEditBookingStatus}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="اختر الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="booked">محجوز</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-availability" className="text-right">
                    إعادة جدولة الموعد
                  </Label>
                  <Select
                    value={editBookingAvailabilityId}
                    onValueChange={setEditBookingAvailabilityId}
                    disabled={slotsLoading}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="اختر موعداً جديداً" />
                    </SelectTrigger>
                    <SelectContent>
                      {slotsLoading ? (
                        <SelectItem value={editBookingAvailabilityId}>جاري التحميل...</SelectItem>
                      ) : (
                        availableSlots.length > 0 ? (
                          availableSlots.map(slot => (
                            <SelectItem key={slot.id} value={slot.id}>
                              {new Date(slot.startTime).toLocaleDateString('ar-EG')} - {new Date(slot.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} إلى {new Date(slot.endTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value={editBookingAvailabilityId}>لا توجد مواعيد متاحة أخرى</SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={editBookingLoading}>
                  {editBookingLoading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Booking Confirmation Dialog */}
      <Dialog open={isDeleteBookingDialogOpen} onOpenChange={setDeleteBookingDialogOpen}>
        <DialogContent className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تأكيد حذف الحجز</DialogTitle>
            <DialogDescription>
              هل أنت متأكد أنك تريد حذف هذا الحجز؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBookingDialogOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDeleteBooking} disabled={deleteBookingLoading}>
              {deleteBookingLoading ? 'جاري الحذف...' : 'تأكيد الحذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!selectedMentor} onOpenChange={(isOpen) => !isOpen && setSelectedMentor(null)}>
        <DialogContent className="max-w-2xl rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل الموجه: {selectedMentor?.name}</DialogTitle>
            <DialogDescription>
              معلومات تفصيلية عن الموجه والفرق المعينة له.
            </DialogDescription>
          </DialogHeader>
          {selectedMentor && (
            <div className="space-y-4 py-4">
              {/* Details content here */}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Mentor Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الموجه</DialogTitle>
            <DialogDescription>
              قم بتحديث معلومات الموجه.
            </DialogDescription>
          </DialogHeader>
          {mentorToEdit && (
            <form onSubmit={handleUpdateMentor}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-name" className="text-right">
                    الاسم
                  </Label>
                  <Input
                    id="edit-name"
                    value={mentorToEdit.name}
                    onChange={(e) => setMentorToEdit({ ...mentorToEdit, name: e.target.value })}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-email" className="text-right">
                    البريد الإلكتروني
                  </Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={mentorToEdit.email}
                    onChange={(e) => setMentorToEdit({ ...mentorToEdit, email: e.target.value })}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-specialty" className="text-right">
                    التخصص
                  </Label>
                  <Input
                    id="edit-specialty"
                    value={mentorToEdit.specialty}
                    onChange={(e) => setMentorToEdit({ ...mentorToEdit, specialty: e.target.value })}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-phone" className="text-right">
                    رقم الجوال
                  </Label>
                  <Input
                    id="edit-phone"
                    value={mentorToEdit.phone}
                    onChange={(e) => setMentorToEdit({ ...mentorToEdit, phone: e.target.value })}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="edit-status" className="text-right">
                    الحالة
                  </Label>
                  <Select
                    value={mentorToEdit.status}
                    onValueChange={(value) => setMentorToEdit({ ...mentorToEdit, status: value as 'pending' | 'active' | 'inactive' })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="اختر الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">نشط</SelectItem>
                      <SelectItem value="pending">بانتظار التفعيل</SelectItem>
                      <SelectItem value="inactive">غير نشط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">حفظ التغييرات</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Mentor Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد أنك تريد إزالة الموجه "{mentorToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDeleteMentor}>
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Availability Dialog */}
      <Dialog open={isAvailabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent className="max-w-6xl rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>إدارة جدول توفر الموجه: {mentorForAvailability?.name}</DialogTitle>
            <DialogDescription>
              انقر على خانة زمنية لإضافتها، أو انقر على موعد موجود لإزالته.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowDatePicker(!showDatePicker)}>
              {showDatePicker ? 'إخفاء اختيار التاريخ' : 'إظهار اختيار التاريخ'}
            </Button>
          </div>
          {showDatePicker && (
            <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-4 p-4 bg-gray-100 rounded-md">
              <Select
                value={String(calendarDate.getFullYear())}
                onValueChange={(value) => handleDateChange(new Date(parseInt(value), calendarDate.getMonth(), calendarDate.getDate()))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="السنة" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(calendarDate.getMonth())}
                onValueChange={(value) => handleDateChange(new Date(calendarDate.getFullYear(), parseInt(value), calendarDate.getDate()))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="الشهر" />
                </SelectTrigger>
                <SelectContent>
                  {moment.months().map((month, index) => (
                    <SelectItem key={index} value={String(index)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(calendarDate.getDate())}
                onValueChange={(value) => handleDateChange(new Date(calendarDate.getFullYear(), calendarDate.getMonth(), parseInt(value)))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="اليوم" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: moment(calendarDate).daysInMonth() }, (_, i) => i + 1).map(day => (
                    <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div style={{ height: '70vh', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
            <BigCalendar
              localizer={localizer}
              step={SLOT_STEP_MINUTES}
              timeslots={SLOT_TIMESLOTS_PER_HOUR}
              events={availabilityEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              view="week"
              views={['week']}
              toolbar={false}
              rtl={true}
              selectable
              onSelectSlot={(slotInfo) => setSlotToAdd(slotInfo)}
              onSelectEvent={(event) => setEventToDelete(event)}
              messages={messages}
              date={calendarDate}
              onNavigate={(date) => handleDateChange(date)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvailabilityDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Availability Confirmation */}
      <Dialog open={!!slotToAdd} onOpenChange={() => setSlotToAdd(null)}>
        <DialogContent className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>إضافة فترة توفر</DialogTitle>
            <DialogDescription>
              هل أنت متأكد أنك تريد إضافة فترة التوفر هذه؟
              <br />
              <strong>من:</strong> {slotToAdd?.start.toLocaleString()}
              <br />
              <strong>إلى:</strong> {slotToAdd?.end.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlotToAdd(null)}>
              إلغاء
            </Button>
            <Button onClick={handleAddAvailability}>تأكيد الإضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Availability Confirmation */}
      <Dialog open={!!eventToDelete} onOpenChange={() => setEventToDelete(null)}>
        <DialogContent className="rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>إزالة فترة توفر</DialogTitle>
            <DialogDescription>
              هل أنت متأكد أنك تريد إزالة فترة التوفر هذه؟
              <br />
              <strong>من:</strong> {eventToDelete?.start.toLocaleString()}
              <br />
              <strong>إلى:</strong> {eventToDelete?.end.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventToDelete(null)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDeleteAvailability}>
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MentorMessageDialog mentor={mentorToMessage} onClose={() => setMentorToMessage(null)} />
    </div>
  );
}
