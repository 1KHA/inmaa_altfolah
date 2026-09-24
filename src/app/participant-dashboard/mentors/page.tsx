"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Calendar,
  Clock,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  Building2
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
  /** Organization slots: the hosting member's name (null when admin hides names). */
  mentorName?: string | null;
}

// Mentor organizations (GET /api/organizations). `members` is only present
// when the admin lets participants see individual mentors.
interface Organization {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  specialties: string[];
  members?: { id: string; name: string; specialty: string }[];
  upcomingSlots: number;
  availableSlots: number;
}

type BookingMode = 'individual' | 'organization' | 'both';

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
  organization?: { id: string; name: string; logoUrl: string | null } | null;
}


// Define the Mentor type
interface Mentor {
  id: string;
  name: string;
  specialty: string;
  status: 'pending' | 'active' | 'inactive';
  organization?: { id: string; name: string; logoUrl: string | null } | null;
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
  // 'all' | 'none' (mentors without an organization) | organization id
  const [orgFilter, setOrgFilter] = useState('all');
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
  // Admin-controlled booking mode + organizations (see src/lib/organizations.ts)
  const [bookingMode, setBookingMode] = useState<BookingMode>('individual');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const { toast } = useToast();
  const showIndividuals = bookingMode !== 'organization';
  const showOrganizations = bookingMode !== 'individual';

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
    const response = await fetch('/api/admin/mentors');
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
  };

  const fetchOrganizations = async (): Promise<BookingMode> => {
    const response = await fetch('/api/organizations');
    if (!response.ok) {
      throw new Error('فشل في جلب قائمة الجهات');
    }
    const data = await response.json();
    const mode: BookingMode = ['individual', 'organization', 'both'].includes(data.mode) ? data.mode : 'individual';
    setBookingMode(mode);
    setOrganizations(data.organizations || []);
    return mode;
  };

  const loadDirectory = async () => {
    try {
      setLoading(true);
      setProgress(30);
      // The mode decides what the participant may see: in organization-only
      // mode individual mentors are never fetched (names stay hidden).
      const mode = await fetchOrganizations();
      setProgress(60);
      if (mode !== 'organization') {
        await fetchMentors();
      } else {
        setMentors([]);
        setFilteredMentors([]);
      }
      setProgress(100);
    } catch (error) {
      console.error(error);
      setError('فشل في جلب قائمة الموجهين. يرجى المحاولة مرة أخرى لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
    fetchMyBookings();
  }, []);

  const filteredOrganizations = organizations.filter((org) => {
    const q = searchTerm.toLowerCase();
    return (
      org.name.toLowerCase().includes(q) ||
      (org.description || '').toLowerCase().includes(q) ||
      org.specialties.some((sp) => sp.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    // Filter by search + organization, then group: mentors of the same
    // organization sit together (organizations A→Z, members A→Z), mentors
    // without an organization last.
    const q = searchTerm.toLowerCase();
    const filtered = mentors.filter(mentor =>
      (mentor.name.toLowerCase().includes(q) ||
        mentor.specialty.toLowerCase().includes(q) ||
        (mentor.organization?.name || '').toLowerCase().includes(q)) &&
      (orgFilter === 'all' ||
        (orgFilter === 'none' ? !mentor.organization : mentor.organization?.id === orgFilter))
    );
    const byName = (a: string, b: string) => a.localeCompare(b, 'ar');
    filtered.sort((a, b) => {
      if (!!a.organization !== !!b.organization) return a.organization ? -1 : 1;
      if (a.organization && b.organization && a.organization.id !== b.organization.id) {
        return byName(a.organization.name, b.organization.name);
      }
      return byName(a.name, b.name);
    });
    setFilteredMentors(filtered);
  }, [searchTerm, orgFilter, mentors]);

  // Organizations present in the mentors list (for the filter), A→Z.
  const mentorOrgOptions = Array.from(
    new Map(mentors.filter((m) => m.organization).map((m) => [m.organization!.id, m.organization!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const hasUnaffiliated = mentors.some((m) => !m.organization);

  const fetchOrganizationAvailability = async (orgId: string) => {
    try {
      setAvailabilityLoading(true);
      const response = await fetch(`/api/organizations?id=${encodeURIComponent(orgId)}`);
      if (!response.ok) {
        toast({ title: "خطأ", description: "فشل في جلب مواعيد الجهة.", variant: "destructive" });
        return;
      }
      const data = await response.json();
      const events: AvailabilityEvent[] = (data.slots || []).map((slot: any) => ({
        id: slot.id,
        start: new Date(slot.startTime),
        end: new Date(slot.endTime),
        title: slot.isBooked ? (slot.isOwnBooking ? 'محجوز بواسطتك' : 'محجوز') : 'متاح',
        isBooked: slot.isBooked,
        isOwnBooking: slot.isOwnBooking,
        mentorName: slot.mentorName ?? null,
      }));
      setAvailabilityEvents(events);
    } catch (error) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء جلب المواعيد.", variant: "destructive" });
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const fetchMentorAvailability = async (mentorId: string) => {
    try {
      setAvailabilityLoading(true);
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
    } finally {
      setAvailabilityLoading(false);
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
    setSelectedOrg(null);
    setSelectedEvent(null); // Reset selected event
    setAvailabilityEvents([]);
    fetchMentorAvailability(mentor.id);
    setAvailabilityDialogOpen(true);
  };

  const openOrganizationDialog = (org: Organization) => {
    setSelectedOrg(org);
    setSelectedMentor(null);
    setSelectedEvent(null);
    setAvailabilityEvents([]);
    fetchOrganizationAvailability(org.id);
    setAvailabilityDialogOpen(true);
  };

  // Re-fetch whichever directory/availability is open after a booking.
  const refreshAfterBooking = () => {
    if (selectedOrg) fetchOrganizationAvailability(selectedOrg.id);
    else if (selectedMentor) fetchMentorAvailability(selectedMentor.id);
    fetchOrganizations().catch(() => {});
    if (showIndividuals) fetchMentors().catch(() => {});
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
          // Booking through an organization: every member is notified and
          // gets the meeting link (see book-appointment route).
          ...(selectedOrg ? { organizationId: selectedOrg.id } : {}),
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
        refreshAfterBooking();
        fetchMyBookings(); // Refresh the bookings list
        setSelectedEvent(null);
      } else {
        toast({
          title: "فشل الحجز",
          description: data.message || data.error,
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
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">
          {bookingMode === 'organization' ? 'الجهات الموجِّهة' : 'الموجهون المتاحون'}
        </h1>
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
                    <div className="mr-4 bg-blue-100 p-2 rounded-full shrink-0">
                      {booking.organization?.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={booking.organization.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                      ) : booking.organization ? (
                        <Building2 className="h-6 w-6 text-blue-600" />
                      ) : (
                        <CheckCircle2 className="h-6 w-6 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {booking.organization ? (
                        <>
                          <div className="font-medium text-blue-900 break-words">{booking.organization.name}</div>
                          <div className="text-sm text-gray-600">
                            جلسة مع الجهة{showIndividuals && booking.mentorName ? ` • ${booking.mentorName}` : ''}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-blue-900">{booking.mentorName}</div>
                          <div className="text-sm text-gray-600">{booking.mentorSpecialty}</div>
                        </>
                      )}
                      <div className="text-sm text-gray-500 mt-1">
                        {formattedDate} • {formattedStartTime} - {formattedEndTime}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-2 shrink-0">
                      <Badge className="bg-green-100 text-green-800">
                        {booking.status === 'booked' ? 'محجوز' : booking.status === 'completed' ? 'مكتملة' : booking.status}
                      </Badge>
                      {booking.meetingUrl && booking.status === 'booked' && (
                        <Button
                          asChild
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-8 text-xs"
                        >
                          <a href={`/api/meeting/join/${booking.id}`} target="_blank" rel="noopener noreferrer">
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
              <p className="text-sm text-gray-400 mt-1">
                {bookingMode === 'organization' ? 'يمكنك حجز موعد مع إحدى الجهات من القائمة أدناه' : 'يمكنك حجز موعد مع أحد الموجهين من القائمة أدناه'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards — in organization-only mode the counts describe the
          organizations, since individual mentors are hidden there. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 sm:mb-8">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {showIndividuals ? <Users className="h-5 w-5 text-blue-500" /> : <Building2 className="h-5 w-5 text-blue-500" />}
              {showIndividuals ? 'إجمالي الموجهين' : 'إجمالي الجهات'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{showIndividuals ? mentors.length : organizations.length}</div>
            <p className="text-xs text-muted-foreground">
              {showIndividuals ? 'موجه نشط متاح للمساعدة' : 'جهة موجِّهة متاحة للمساعدة'}
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-500" />
              {showIndividuals ? 'متاحون الآن' : 'جهات متاحة الآن'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {showIndividuals
                ? mentors.filter(m => (m.availableSlots ?? 0) > 0).length
                : organizations.filter(o => o.availableSlots > 0).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {showIndividuals ? 'موجه لديه مواعيد متاحة للحجز' : 'جهة لديها مواعيد متاحة للحجز'}
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
              {showIndividuals
                ? mentors.reduce((total, mentor) => total + (mentor.availableSlots ?? 0), 0)
                : organizations.reduce((total, o) => total + o.availableSlots, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {showIndividuals ? 'موعد قادم غير محجوز لدى جميع الموجهين' : 'موعد قادم غير محجوز لدى جميع الجهات'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-6 sm:mb-8 border-0 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative w-full flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 h-5 w-5 pointer-events-none" />
              <Input
                placeholder={showIndividuals ? "البحث بالاسم، التخصص، أو الجهة..." : "البحث باسم الجهة أو التخصص..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 pr-12 text-base border-blue-100 focus:border-blue-300 rounded-full"
              />
            </div>
            {showIndividuals && mentorOrgOptions.length > 0 && (
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="h-12 w-full sm:w-64 rounded-full border-blue-100 focus:border-blue-300" aria-label="تصفية حسب الجهة">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                    <SelectValue placeholder="كل الجهات" />
                  </div>
                </SelectTrigger>
                <SelectContent dir="rtl" className="text-right">
                  <SelectItem value="all">كل الجهات</SelectItem>
                  {mentorOrgOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                  {hasUnaffiliated && <SelectItem value="none">بدون جهة</SelectItem>}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Organizations (visible in 'organization' and 'both' modes) */}
      {showOrganizations && (
        <Card className="mb-6 sm:mb-8 border-0 shadow-sm overflow-hidden">
          <CardHeader className="pb-2 text-right" dir="rtl">
            <CardTitle className="text-lg font-bold text-blue-800 flex items-center justify-start gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              الحجز مع جهة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredOrganizations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredOrganizations.map((org) => (
                  <div key={org.id} className="flex flex-col rounded-lg border border-blue-100 bg-white p-4 min-w-0 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3 min-w-0">
                      {org.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={org.logoUrl} alt={org.name} className="h-16 w-16 rounded-lg object-contain border bg-white shrink-0" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <Building2 className="h-8 w-8" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-blue-900 break-words">{org.name}</div>
                        {org.description && (
                          <div className="text-xs text-gray-600 mt-1 line-clamp-3 break-words">{org.description}</div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {org.specialties.slice(0, 3).map((sp) => (
                            <Badge key={sp} variant="secondary" className="text-[11px] font-normal">{sp}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{org.memberCount} موجه</span>
                      {org.availableSlots > 0 ? (
                        <Badge className="bg-green-100 text-green-800">متاح ({org.availableSlots})</Badge>
                      ) : org.upcomingSlots > 0 ? (
                        <Badge className="bg-red-100 text-red-800">مشغول</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">لا توجد مواعيد</Badge>
                      )}
                    </div>
                    {org.members && org.members.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500 break-words">
                        {org.members.slice(0, 3).map((m) => m.name).join('، ')}{org.members.length > 3 ? ` +${org.members.length - 3}` : ''}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 flex items-center gap-1"
                      onClick={() => openOrganizationDialog(org)}
                    >
                      <Calendar className="h-4 w-4" />
                      عرض مواعيد الجهة
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                {organizations.length === 0 ? 'لا توجد جهات متاحة للحجز حالياً' : 'لا توجد جهات متطابقة مع البحث'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mentors Table (hidden in organization-only mode) */}
      {showIndividuals && (
      <Card className="border-0 shadow-sm overflow-hidden">
        {bookingMode === 'both' && (
          <CardHeader className="pb-2 text-right" dir="rtl">
            <CardTitle className="text-lg font-bold text-blue-800 flex items-center justify-start gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              الحجز مع موجه محدد
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="bg-blue-50 hover:bg-blue-50">
                  <TableHead className="text-right font-semibold text-blue-900">الاسم</TableHead>
                  <TableHead className="text-right font-semibold text-blue-900 hidden sm:table-cell">الجهة</TableHead>
                  <TableHead className="text-right font-semibold text-blue-900 hidden sm:table-cell">التخصص</TableHead>
                  <TableHead className="text-right font-semibold text-blue-900 hidden sm:table-cell">التوفر</TableHead>
                  <TableHead className="text-center font-semibold text-blue-900 w-[140px]">المواعيد</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {filteredMentors.length > 0 ? (
                filteredMentors.map((mentor, index) => {
                  // Group header when this mentor starts a new organization block
                  const orgKey = mentor.organization?.id ?? 'none';
                  const prevKey = index > 0 ? (filteredMentors[index - 1].organization?.id ?? 'none') : null;
                  const groupSize = filteredMentors.filter((m) => (m.organization?.id ?? 'none') === orgKey).length;
                  const header = orgKey !== prevKey ? (
                    <TableRow key={`org-${orgKey}`} className="bg-blue-50/70 hover:bg-blue-50/70">
                      <TableCell colSpan={5} className="py-2 text-right">
                        <div className="flex items-center gap-2 font-semibold text-blue-900">
                          {mentor.organization?.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mentor.organization.logoUrl} alt="" className="h-6 w-6 rounded object-contain border bg-white" />
                          ) : (
                            <Building2 className="h-4 w-4 text-blue-500" />
                          )}
                          <span>{mentor.organization ? mentor.organization.name : 'موجهون بدون جهة'}</span>
                          <Badge variant="secondary" className="font-normal text-[11px]">{groupSize} موجه</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null;
                  return (
                  <React.Fragment key={mentor.id}>
                  {header}
                  <TableRow className="hover:bg-gray-50 transition-colors duration-150">
                    <TableCell className="font-medium text-right">
                      <div>{mentor.name}</div>
                      {/* Mobile: organization + specialty + availability stacked under the name */}
                      <div className="sm:hidden text-xs text-gray-500 mt-1 space-y-1">
                        {mentor.organization && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {mentor.organization.name}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {mentor.specialty}
                        </div>
                        <div>{getAvailabilityBadge(mentor)}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right">
                      {mentor.organization ? (
                        <div className="flex items-center gap-2 min-w-0">
                          {mentor.organization.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mentor.organization.logoUrl} alt="" className="h-8 w-8 rounded object-contain border bg-white shrink-0" />
                          ) : (
                            <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate max-w-[180px]" title={mentor.organization.name}>{mentor.organization.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-gray-500" />
                        <span>{mentor.specialty}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right">
                      {getAvailabilityBadge(mentor)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 inline-flex items-center gap-1 w-full sm:w-auto text-xs sm:text-sm"
                        onClick={() => openAvailabilityDialog(mentor)}
                      >
                        <Calendar className="h-4 w-4" />
                        <span className="hidden sm:inline">عرض المواعيد</span>
                        <span className="sm:hidden">المواعيد</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    لا يوجد موجهين متطابقين مع البحث
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Availability Dialog */}
      <Dialog open={isAvailabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedOrg?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedOrg.logoUrl} alt="" className="h-8 w-8 rounded object-contain border bg-white" />
              )}
              {selectedOrg ? `مواعيد الجهة: ${selectedOrg.name}` : `مواعيد توفر الموجه: ${selectedMentor?.name ?? ''}`}
            </DialogTitle>
            <DialogDescription>
              {selectedOrg
                ? 'المواعيد المتاحة لدى موجهي الجهة — عند الحجز يصل الإشعار ورابط الاجتماع لجميع أعضائها'
                : 'المواعيد المتاحة للموجه خلال الأسبوع الحالي'}
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
                            {ev.mentorName && (
                              <span className="block text-[10px] mt-0.5 truncate opacity-80">{ev.mentorName}</span>
                            )}
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
            ) : availabilityLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">جاري تحميل المواعيد...</div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10">
                <Calendar className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-gray-500">لا توجد مواعيد متاحة حالياً</p>
                <p className="text-gray-400 text-sm mt-1">{selectedOrg ? 'يرجى التحقق لاحقاً' : 'يرجى التحقق لاحقاً أو التواصل مع الموجه مباشرة'}</p>
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
                    title: event.mentorName ? `${event.title} — ${event.mentorName}` : event.title,
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
            ) : availabilityLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">جاري تحميل المواعيد...</div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <Calendar className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">لا توجد مواعيد متاحة حالياً</p>
                <p className="text-gray-400 text-sm mt-2">{selectedOrg ? 'يرجى التحقق لاحقاً' : 'يرجى التحقق لاحقاً أو التواصل مع الموجه مباشرة'}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
