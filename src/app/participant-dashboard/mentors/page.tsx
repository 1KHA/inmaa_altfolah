"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { Progress } from '../../../../components/ui/progress';
import { 
  Search, 
  Users,
  Mail,
  Calendar,
  Clock,
  Phone,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  CalendarClock
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { useToast } from '../../../../components/ui/use-toast';
import { Calendar as BigCalendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ar'; // Import Arabic locale
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { SLOT_STEP_MINUTES, SLOT_TIMESLOTS_PER_HOUR } from '@/lib/constants';
import { Alert, AlertDescription } from '../../../../components/ui/alert';

moment.locale('ar'); // Set moment to use Arabic
const localizer = momentLocalizer(moment);

// ---- mobile slot-list helpers (the week calendar is unusable on phones) ----
const fmtSlotTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

function groupSlotsByDay(events: AvailabilityEvent[]) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  const groups: { day: string; slots: AvailabilityEvent[] }[] = [];
  for (const e of sorted) {
    const day = new Date(e.start).toLocaleDateString('ar-SA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.slots.push(e);
    else groups.push({ day, slots: [e] });
  }
  return groups;
}

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
  isBooked?: boolean;
  isOwnBooking?: boolean;
}

// Define the Booking type
interface Booking {
  id: string;
  mentorName: string;
  mentorSpecialty: string;
  startTime: string;
  endTime: string;
  status: string;
  meetingUrl?: string | null;
  createdAt: string;
}


// Define the Mentor type
interface Mentor {
  id: string;
  name: string;
  email: string;
  specialty: string;
  phone: string;
  status: 'pending' | 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  // Real availability summary computed server-side from FUTURE slots
  // (GET /api/admin/mentors — participant branch). Never mock data.
  availability?: string | null; // متاح | متاح جزئياً | مشغول | null (no slots)
  availableSlots?: number;
  upcomingSlots?: number;
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [filteredMentors, setFilteredMentors] = useState<Mentor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);
  const [availabilityEvents, setAvailabilityEvents] = useState<AvailabilityEvent[]>([]);
  const [isAvailabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AvailabilityEvent | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const { toast } = useToast();

  const fetchMyBookings = async () => {
    try {
      setBookingsLoading(true);
      const response = await fetch('/api/participant/my-bookings');
      
      if (!response.ok) {
        throw new Error('فشل في جلب المواعيد المحجوزة');
      }
      
      const data = await response.json();
      setMyBookings(data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast({
        title: "خطأ",
        description: "فشل في جلب المواعيد المحجوزة",
        variant: "destructive",
      });
    } finally {
      setBookingsLoading(false);
    }
  };

  const fetchMentors = async () => {
    try {
      setLoading(true);
      setProgress(30);
      const response = await fetch('/api/admin/mentors');
      setProgress(60);
      
      if (!response.ok) {
        throw new Error('فشل في جلب قائمة الموجهين');
      }
      
      const data = await response.json();
      
      // Filter only active mentors
      const activeMentors = data.filter((mentor: Mentor) => mentor.status === 'active');
      
      // availability/availableSlots come from the API, computed from real
      // future slots — this used to be Math.random() mock data.
      setMentors(activeMentors);
      setFilteredMentors(activeMentors);
      setProgress(100);
    } catch (error) {
      console.error(error);
      setError('فشل في جلب قائمة الموجهين. يرجى المحاولة مرة أخرى لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMentors();
    fetchMyBookings();
  }, []);

  useEffect(() => {
    // Filter mentors based on search term
    const filtered = mentors.filter(mentor => 
      mentor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mentor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mentor.specialty.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredMentors(filtered);
  }, [searchTerm, mentors]);

  const fetchMentorAvailability = async (mentorId: string) => {
    try {
      const response = await fetch(`/api/admin/mentors/${mentorId}/availability`);
      if (response.ok) {
        const data = await response.json();
        
        // Format events
        const formattedEvents = await Promise.all(data.map(async (avail: any) => {
          // Check if this availability is already booked
          const bookingResponse = await fetch(`/api/participant/book-appointment?availabilityId=${avail.id}`);
          const bookingData = await bookingResponse.json();
          
          return {
            id: avail.id,
            start: new Date(avail.startTime),
            end: new Date(avail.endTime),
            title: bookingData.isBooked ? (bookingData.isOwnBooking ? 'محجوز بواسطتك' : 'محجوز') : 'متاح',
            isBooked: bookingData.isBooked,
            isOwnBooking: bookingData.isOwnBooking,
          };
        }));
        
        setAvailabilityEvents(formattedEvents);
      } else {
        toast({
          title: "خطأ",
          description: "فشل في جلب مواعيد الموجه.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء جلب المواعيد.",
        variant: "destructive",
      });
    }
  };

  const getAvailabilityBadge = (mentor: Mentor) => {
    switch (mentor.availability) {
      case 'متاح':
        return <Badge className="bg-green-100 text-green-800">متاح ({mentor.availableSlots})</Badge>;
      case 'متاح جزئياً':
        return <Badge className="bg-yellow-100 text-yellow-800">متاح جزئياً ({mentor.availableSlots})</Badge>;
      case 'مشغول':
        return <Badge className="bg-red-100 text-red-800">مشغول</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">لا توجد مواعيد</Badge>;
    }
  };

  const openAvailabilityDialog = (mentor: Mentor) => {
    setSelectedMentor(mentor);
    setSelectedEvent(null); // Reset selected event
    fetchMentorAvailability(mentor.id);
    setAvailabilityDialogOpen(true);
  };
  
  const handleSelectEvent = (event: AvailabilityEvent) => {
    // If the event is already booked, don't allow selection
    if (event.isBooked) {
      if (event.isOwnBooking) {
        toast({
          title: "موعد محجوز",
          description: "لقد قمت بحجز هذا الموعد بالفعل.",
          variant: "default",
        });
      } else {
        toast({
          title: "موعد محجوز",
          description: "هذا الموعد محجوز بالفعل من قبل مشارك آخر.",
          variant: "destructive",
        });
      }
      return;
    }
    
    // If the event is in the past, don't allow selection
    if (new Date(event.start) < new Date()) {
      toast({
        title: "موعد غير متاح",
        description: "لا يمكن حجز موعد في الماضي.",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedEvent(event);
    toast({
      title: "تم اختيار الموعد",
      description: `${event.start.toLocaleString()} - ${event.end.toLocaleString()}`,
    });
  };
  
  const bookAppointment = async () => {
    if (!selectedEvent) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار موعد أولاً.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setBookingLoading(true);
      
      const response = await fetch('/api/participant/book-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          availabilityId: selectedEvent.id,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "تم الحجز بنجاح",
          description: data.message,
          variant: "default",
        });
        
        // Refresh availability data and bookings
        fetchMentorAvailability(selectedMentor!.id);
        fetchMyBookings(); // Refresh the bookings list
        setSelectedEvent(null);
      } else {
        toast({
          title: "فشل الحجز",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء محاولة حجز الموعد.",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        <Progress value={progress} className="w-full h-2" />
        <p className="text-center text-muted-foreground">جاري تحميل قائمة الموجهين...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-3 sm:p-8" dir="rtl">
      <div className="flex justify-between items-center mb-4 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">الموجهون المتاحون</h1>
      </div>

      {/* My Booked Appointments Box */}
      <Card className="mb-8 border-0 shadow-md bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bold text-blue-800 flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-blue-600" />
            المواعيد التي حجزتها
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bookingsLoading ? (
            <div className="py-4 text-center">
              <Progress value={70} className="w-full h-2 mb-2" />
              <p className="text-sm text-muted-foreground">جاري تحميل المواعيد المحجوزة...</p>
            </div>
          ) : myBookings.length > 0 ? (
            <div className="space-y-4">
              {myBookings.map((booking) => {
                // Format dates
                const startDate = new Date(booking.startTime);
                const endDate = new Date(booking.endTime);
                const formattedDate = startDate.toLocaleDateString('ar-SA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                });
                const formattedStartTime = startDate.toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const formattedEndTime = endDate.toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div key={booking.id} className="flex items-center p-3 rounded-lg bg-white shadow-sm border border-blue-100">
                    <div className="mr-4 bg-blue-100 p-2 rounded-full">
                      <CheckCircle2 className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-blue-900">{booking.mentorName}</div>
                      <div className="text-sm text-gray-600">{booking.mentorSpecialty}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {formattedDate} • {formattedStartTime} - {formattedEndTime}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-2 shrink-0">
                      <Badge className="bg-green-100 text-green-800">
                        {booking.status === 'booked' ? 'محجوز' : booking.status}
                      </Badge>
                      {booking.meetingUrl && booking.status === 'booked' && (
                        <Button
                          asChild
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-8 text-xs"
                        >
                          <a href={booking.meetingUrl} target="_blank" rel="noopener noreferrer">
                            دخول الاجتماع
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="text-center mt-2">
                <Button 
                  variant="outline" 
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={fetchMyBookings}
                >
                  تحديث المواعيد
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Calendar className="h-12 w-12 text-blue-300 mx-auto mb-3" />
              <p className="text-gray-500">لم تقم بحجز أي مواعيد بعد</p>
              <p className="text-sm text-gray-400 mt-1">يمكنك حجز موعد مع أحد الموجهين من القائمة أدناه</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 sm:mb-8">
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
              موجه نشط متاح للمساعدة
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-500" />
              متاحون الآن
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {mentors.filter(m => (m.availableSlots ?? 0) > 0).length}
            </div>
            <p className="text-xs text-muted-foreground">
              موجه لديه مواعيد متاحة للحجز
            </p>
          </CardContent>
        </Card>
        
        {/* Replaced "متوسط التقييم": no rating system exists, the number was
            random. This counts real bookable slots instead. */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-5 w-5 text-yellow-500" />
              مواعيد متاحة للحجز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {mentors.reduce((total, mentor) => total + (mentor.availableSlots ?? 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              موعد قادم غير محجوز لدى جميع الموجهين
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-6 sm:mb-8 border-0 shadow-sm overflow-hidden">
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col gap-4 items-center">
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
          </div>
        </CardContent>
      </Card>

      {/* Mentors Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="bg-blue-50 hover:bg-blue-50">
                  <TableHead>الاسم</TableHead>
                  <TableHead className="hidden sm:table-cell">التخصص</TableHead>
                  <TableHead className="hidden sm:table-cell">التوفر</TableHead>
                  <TableHead className="text-left">المواعيد</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {filteredMentors.length > 0 ? (
                filteredMentors.map((mentor) => (
                  <TableRow key={mentor.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <TableCell className="font-medium">
                      <div>{mentor.name}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {mentor.email}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {mentor.phone}
                      </div>
                      <div className="sm:hidden text-xs text-gray-500 mt-1">
                        {getAvailabilityBadge(mentor)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-gray-500" />
                        <span>{mentor.specialty}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {getAvailabilityBadge(mentor)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col sm:flex-row items-center gap-2 justify-end">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 flex items-center gap-1 w-full sm:w-auto text-xs sm:text-sm"
                          onClick={() => openAvailabilityDialog(mentor)}
                        >
                          <Calendar className="h-4 w-4" />
                          <span className="hidden sm:inline">عرض المواعيد</span>
                          <span className="sm:hidden">المواعيد</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                    لا يوجد موجهين متطابقين مع البحث
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Availability Dialog */}
      <Dialog open={isAvailabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>مواعيد توفر الموجه: {selectedMentor?.name}</DialogTitle>
            <DialogDescription>
              المواعيد المتاحة للموجه خلال الأسبوع الحالي
            </DialogDescription>
          </DialogHeader>
          {/* Mobile: tappable slot list grouped by day */}
          <div className="md:hidden max-h-[65vh] overflow-y-auto space-y-4 py-1">
            {availabilityEvents.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#60a5fa]"></span>متاح</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#f87171]"></span>محجوز</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#4ade80]"></span>محجوز بواسطتك</span>
                </div>
                {groupSlotsByDay(availabilityEvents).map((group) => (
                  <div key={group.day}>
                    <div className="text-sm font-semibold text-muted-foreground mb-2">{group.day}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {group.slots.map((ev) => {
                        const isSelected = selectedEvent?.id === ev.id;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => handleSelectEvent(ev)}
                            className={`rounded-lg border p-2 text-center transition-colors ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : ev.isBooked
                                  ? ev.isOwnBooking
                                    ? 'bg-green-50 border-green-300 text-green-700'
                                    : 'bg-red-50 border-red-200 text-red-400'
                                  : 'bg-blue-50 border-blue-200 text-blue-700 active:bg-blue-100'
                            }`}
                          >
                            <span className="block text-sm font-medium" dir="ltr">
                              {fmtSlotTime(ev.start)} – {fmtSlotTime(ev.end)}
                            </span>
                            <span className="block text-[11px] mt-0.5">
                              {ev.isBooked ? (ev.isOwnBooking ? 'محجوز بواسطتك' : 'محجوز') : isSelected ? 'تم الاختيار' : 'متاح'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {selectedEvent && !selectedEvent.isBooked && (
                  <div className="sticky bottom-0 bg-background border-t pt-3 pb-1">
                    <Button
                      onClick={bookAppointment}
                      disabled={bookingLoading}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      {bookingLoading ? 'جاري الحجز...' : 'حجز هذا الموعد'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10">
                <Calendar className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-gray-500">لا توجد مواعيد متاحة حالياً</p>
                <p className="text-gray-400 text-sm mt-1">يرجى التحقق لاحقاً أو التواصل مع الموجه مباشرة</p>
              </div>
            )}
          </div>

          {/* Desktop: week calendar (unchanged) */}
          <div className="hidden md:block" style={{ height: '70vh', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
            {availabilityEvents.length > 0 ? (
              <>
                <BigCalendar
                  localizer={localizer}
                  step={SLOT_STEP_MINUTES}
                  timeslots={SLOT_TIMESLOTS_PER_HOUR}
                  events={availabilityEvents.map(event => ({
                    ...event,
                    title: event.title,
                    // Add color based on booking status
                    style: {
                      backgroundColor: event.isBooked 
                        ? (event.isOwnBooking ? '#4ade80' : '#f87171') 
                        : '#60a5fa'
                    }
                  }))}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: 'calc(100% - 80px)' }}
                  view="week"
                  views={['week']}
                  toolbar={true}
                  rtl={true}
                  messages={messages}
                  onSelectEvent={handleSelectEvent}
                  eventPropGetter={(event) => ({
                    style: {
                      backgroundColor: event.isBooked 
                        ? (event.isOwnBooking ? '#4ade80' : '#f87171') 
                        : '#60a5fa',
                      color: 'white',
                      borderRadius: '4px',
                      border: 'none',
                      cursor: event.isBooked ? 'default' : 'pointer',
                    }
                  })}
                />
                
                <div className="flex justify-between items-center mt-4">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-[#60a5fa]"></div>
                      <span className="text-sm">متاح</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-[#f87171]"></div>
                      <span className="text-sm">محجوز</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-[#4ade80]"></div>
                      <span className="text-sm">محجوز بواسطتك</span>
                    </div>
                  </div>
                  
                  {selectedEvent && !selectedEvent.isBooked && (
                    <Button 
                      onClick={bookAppointment} 
                      disabled={bookingLoading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {bookingLoading ? 'جاري الحجز...' : 'حجز هذا الموعد'}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <Calendar className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">لا توجد مواعيد متاحة حالياً</p>
                <p className="text-gray-400 text-sm mt-2">يرجى التحقق لاحقاً أو التواصل مع الموجه مباشرة</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
