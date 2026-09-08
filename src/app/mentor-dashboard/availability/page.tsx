"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ar'; // Import Arabic locale
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { SLOT_STEP_MINUTES, SLOT_TIMESLOTS_PER_HOUR } from '@/lib/constants';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '../../../../components/ui/label';
import { useToast } from "../../../../components/ui/use-toast"
import { CalendarPlus, Clock, Loader2, Trash2 } from 'lucide-react';

moment.locale('ar'); // Set moment to use Arabic
const localizer = momentLocalizer(moment);

// Arabic labels for the calendar toolbar (it rendered English otherwise)
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
  event: 'فترة توفر',
  noEventsInRange: 'لا توجد فترات توفر في هذه المدة',
  showMore: (total: number) => `+${total} المزيد`,
};

// Working-hours window for the grid: with 15-minute rows a full 24h day is
// 96 rows — unreadable. 07:00–23:00 keeps every realistic slot visible.
const DAY_START = new Date(1970, 0, 1, 7, 0, 0);
const DAY_END = new Date(1970, 0, 1, 23, 0, 0);
const SCROLL_TO = new Date(1970, 0, 1, 9, 0, 0);

interface Availability {
  id: string;
  start: Date;
  end: Date;
  title: string;
}

const AvailabilityPage = () => {
  const [events, setEvents] = useState<Availability[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const calendarRef = useRef<any>(null);

  // State for date selection
  const [selectedDate, setSelectedDate] = useState(moment());
  const [selectedYear, setSelectedYear] = useState(moment().year());
  const [selectedMonth, setSelectedMonth] = useState(moment().month());
  const [selectedDay, setSelectedDay] = useState(moment().date());

  // Mobile add-slot form (native date/time pickers — the drag-select calendar
  // is unusable on touch screens)
  // NOTE: moment is globally set to the 'ar' locale, whose format() emits
  // Arabic-Indic digits — invalid for <input type="date">. Use en digits.
  const [formDate, setFormDate] = useState(moment().locale('en').format('YYYY-MM-DD'));
  const [formTime, setFormTime] = useState('10:00');
  const [adding, setAdding] = useState(false);
  // Two-tap delete confirmation for the mobile list
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Generate years (current year - 5 to current year + 5)
  const currentYear = moment().year();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  // Generate months (Arabic names)
  const months = moment.months();

  // Generate days based on selected year and month
  const getDaysInMonth = (year: number, month: number) => {
    const daysInMonth = moment(`${year}-${month + 1}`, 'YYYY-MM').daysInMonth();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  };
  const days = getDaysInMonth(selectedYear, selectedMonth);

  const fetchAvailabilities = async () => {
    try {
      const response = await fetch('/api/mentor/availability', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const formattedEvents = data.map((avail: any) => ({
          id: avail.id,
          start: new Date(avail.startTime),
          end: new Date(avail.endTime),
          title: 'متاح',
        }));
        setEvents(formattedEvents);
      } else if (response.status === 401) {
        toast({
          title: "غير مصرح",
          description: "يجب تسجيل الدخول لعرض هذه الصفحة. جاري التحويل...",
          variant: "destructive",
        });
        router.push('/login');
      } else {
        toast({
          title: "خطأ",
          description: "فشل في جلب أوقات التوافر.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء جلب أوقات التوافر.",
        variant: "destructive",
      })
    }
  };

  useEffect(() => {
    fetchAvailabilities();
  }, []);

  // Update days when year or month changes
  useEffect(() => {
    const newDays = getDaysInMonth(selectedYear, selectedMonth);
    // If the selected day is not valid in the new month, adjust it
    if (selectedDay > newDays.length) {
      setSelectedDay(newDays.length);
    }
  }, [selectedYear, selectedMonth]);

  // Handle date selection
  const handleDateChange = () => {
    const newDate = moment().year(selectedYear).month(selectedMonth).date(selectedDay);
    setSelectedDate(newDate);

    // Update calendar view to the selected date
    if (calendarRef.current && calendarRef.current.getApi) {
      calendarRef.current.getApi().gotoDate(newDate.toDate());
    } else {
      // For react-big-calendar, we'll update the date prop
      // This will be handled by the date prop in the Calendar component
    }
  };

  const handleSelectSlot = async ({ start, end }: { start: Date; end: Date }) => {
    try {
      const response = await fetch('/api/mentor/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime: start, endTime: end }),
        credentials: 'include',
      });

      if (response.ok) {
        fetchAvailabilities();
        toast({
          title: "تم بنجاح",
          description: "تمت إضافة وقت التوافر بنجاح.",
        })
      } else {
        toast({
          title: "خطأ",
          description: "فشل في إضافة وقت التوافر.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة وقت التوافر.",
        variant: "destructive",
      })
    }
  };

  const deleteAvailability = async (id: string) => {
    try {
      const response = await fetch(`/api/mentor/availability/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        fetchAvailabilities();
        toast({
          title: "تم بنجاح",
          description: "تم حذف وقت التوافر بنجاح.",
        })
      } else {
        toast({
          title: "خطأ",
          description: "فشل في حذف وقت التوافر.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف وقت التوافر.",
        variant: "destructive",
      })
    }
  };

  const handleSelectEvent = async (event: Availability) => {
    if (window.confirm('هل أنت متأكد أنك تريد حذف وقت التوافر هذا؟')) {
      await deleteAvailability(event.id);
    }
  };

  // Add a slot from the mobile form
  const handleAddFromForm = async () => {
    if (!formDate || !formTime) {
      toast({ title: "خطأ", description: "يرجى اختيار التاريخ والوقت.", variant: "destructive" });
      return;
    }
    const start = moment(`${formDate} ${formTime}`, 'YYYY-MM-DD HH:mm');
    if (!start.isValid()) {
      toast({ title: "خطأ", description: "التاريخ أو الوقت غير صالح.", variant: "destructive" });
      return;
    }
    if (start.isBefore(moment())) {
      toast({ title: "خطأ", description: "لا يمكن إضافة وقت في الماضي.", variant: "destructive" });
      return;
    }
    // Every slot is exactly one step long (15 min) — no duration choice.
    const end = start.clone().add(SLOT_STEP_MINUTES, 'minutes');
    setAdding(true);
    await handleSelectSlot({ start: start.toDate(), end: end.toDate() });
    setAdding(false);
  };

  // Upcoming slots grouped by day for the mobile list
  const upcomingByDay = useMemo(() => {
    const upcoming = [...events]
      .filter((e) => e.end.getTime() >= Date.now())
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const groups: { day: string; slots: Availability[] }[] = [];
    for (const e of upcoming) {
      const day = e.start.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.slots.push(e);
      else groups.push({ day, slots: [e] });
    }
    return groups;
  }, [events]);

  const fmtTime = (d: Date) => d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="container mx-auto p-0 sm:p-4" dir="rtl">
      <h1 className="text-2xl font-bold mb-2 sm:mb-4">إدارة أوقات التوافر الخاصة بك</h1>
      <p className="mb-4 hidden md:block text-muted-foreground">
        انقر واسحب على التقويم لإنشاء فترات توافر جديدة، أو أضف وقتاً بدقة من النموذج الجانبي. انقر على فترة في التقويم أو على سلة المهملات في القائمة لحذفها.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {/* ============ Add form + organized slot list (all sizes; the only UI on phones) ============ */}
      <div className="space-y-4 lg:order-2">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-blue-600" />
              إضافة وقت توفر جديد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="slot-date">التاريخ</Label>
              <input
                id="slot-date"
                type="date"
                value={formDate}
                min={moment().locale('en').format('YYYY-MM-DD')}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full p-2 border rounded-md bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slot-time">وقت البداية</Label>
              <input
                id="slot-time"
                type="time"
                value={formTime}
                step={SLOT_STEP_MINUTES * 60}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full p-2 border rounded-md bg-white"
              />
              <p className="text-xs text-muted-foreground">مدة كل فترة {SLOT_STEP_MINUTES} دقيقة</p>
            </div>
            <Button onClick={handleAddFromForm} disabled={adding} className="w-full">
              {adding ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                <>
                  <CalendarPlus className="ml-2 h-4 w-4" />
                  إضافة الوقت
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-600" />
              الأوقات القادمة ({upcomingByDay.reduce((n, g) => n + g.slots.length, 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingByDay.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                لا توجد أوقات توفر قادمة. أضف وقتاً جديداً من النموذج أعلاه.
              </p>
            ) : (
              upcomingByDay.map((group) => (
                <div key={group.day}>
                  <div className="text-sm font-semibold text-muted-foreground mb-2">{group.day}</div>
                  <div className="space-y-2">
                    {group.slots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-blue-50/50 border-blue-100"
                      >
                        <span className="text-sm font-medium" dir="ltr">
                          {fmtTime(slot.start)} – {fmtTime(slot.end)}
                        </span>
                        {confirmDeleteId === slot.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => { setConfirmDeleteId(null); deleteAvailability(slot.id); }}
                            >
                              تأكيد الحذف
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              إلغاء
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 shrink-0"
                            aria-label="حذف الوقت"
                            onClick={() => setConfirmDeleteId(slot.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ Desktop: drag-select calendar ============ */}
      <div className="hidden md:block min-w-0 lg:order-1">
      {/* Date Selection UI */}
      <div className="mb-4 flex flex-wrap gap-2 items-center rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex items-center">
          <label htmlFor="year-select" className="ml-2 font-medium">السنة:</label>
          <select
            id="year-select"
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(parseInt(e.target.value));
              setTimeout(handleDateChange, 0);
            }}
            className="p-2 border rounded-md bg-white text-right"
            dir="rtl"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center">
          <label htmlFor="month-select" className="ml-2 font-medium">الشهر:</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(parseInt(e.target.value));
              setTimeout(handleDateChange, 0);
            }}
            className="p-2 border rounded-md bg-white text-right"
            dir="rtl"
          >
            {months.map((month, index) => (
              <option key={index} value={index}>
                {month}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center">
          <label htmlFor="day-select" className="ml-2 font-medium">اليوم:</label>
          <select
            id="day-select"
            value={selectedDay}
            onChange={(e) => {
              setSelectedDay(parseInt(e.target.value));
              setTimeout(handleDateChange, 0);
            }}
            className="p-2 border rounded-md bg-white text-right"
            dir="rtl"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <Button
          onClick={handleDateChange}
          className="mr-auto"
        >
          انتقال للتاريخ
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white p-3 shadow-sm">
        <div className="min-w-[760px]" style={{ height: '68vh' }}>
        <Calendar
          localizer={localizer}
          step={SLOT_STEP_MINUTES}
          timeslots={SLOT_TIMESLOTS_PER_HOUR}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          selectable
          rtl
          messages={messages}
          min={DAY_START}
          max={DAY_END}
          scrollToTime={SCROLL_TO}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          defaultView="week"
          views={['day', 'week', 'agenda']}
          date={selectedDate.toDate()}
          onNavigate={(date) => {
            const newDate = moment(date);
            setSelectedYear(newDate.year());
            setSelectedMonth(newDate.month());
            setSelectedDay(newDate.date());
            setSelectedDate(newDate);
          }}
          ref={calendarRef}
        />
        </div>
      </div>
      </div>
      </div>
    </div>
  );
};

export default AvailabilityPage;
