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
  Phone,
  Clock,
  Filter,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  XCircle,
  User,
  Video,
} from 'lucide-react';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { useToast } from '../../../../components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';

// Define the MentorBooking type
interface MentorBooking {
  id: string;
  status: string;
  meetingUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  availability: {
    id: string;
    startTime: string;
    endTime: string;
  };
  participant: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string;
  };
  mentor: {
    id: string;
    name: string;
    specialty: string;
  };
}

export default function MentorSessionsPage() {
  const [bookings, setBookings] = useState<MentorBooking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<MentorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<MentorBooking | null>(null);
  const [isDetailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/mentor/bookings');
      
      if (!response.ok) {
        throw new Error('فشل في جلب الجلسات المحجوزة');
      }
      
      const data = await response.json();
      setBookings(data);
      setFilteredBookings(data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setError('فشل في جلب الجلسات المحجوزة. يرجى المحاولة مرة أخرى لاحقاً.');
      toast({
        title: "خطأ",
        description: "فشل في جلب الجلسات المحجوزة",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  useEffect(() => {
    // Filter bookings based on search term and status filter
    let filtered = bookings;
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(booking => booking.status === statusFilter);
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(booking => 
        booking.participant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.participant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.participant.phoneNumber.includes(searchTerm)
      );
    }
    
    setFilteredBookings(filtered);
  }, [searchTerm, statusFilter, bookings]);

  const openDetailsDialog = (booking: MentorBooking) => {
    setSelectedBooking(booking);
    setDetailsDialogOpen(true);
  };

  // Group bookings by date for better organization
  const groupBookingsByDate = () => {
    const grouped: { [date: string]: MentorBooking[] } = {};
    
    filteredBookings.forEach(booking => {
      const startDate = new Date(booking.availability.startTime);
      const dateKey = startDate.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      
      grouped[dateKey].push(booking);
    });
    
    // Sort each group by time
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => 
        new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
      );
    });
    
    return grouped;
  };

  const groupedBookings = groupBookingsByDate();

  // Stats calculations
  const totalBookings = bookings.length;
  const upcomingBookings = bookings.filter(b => 
    new Date(b.availability.startTime) > new Date() && b.status === 'booked'
  ).length;
  const completedBookings = bookings.filter(b => b.status === 'completed').length;
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        <Progress value={70} className="w-full h-2" />
        <p className="text-center text-muted-foreground">جاري تحميل الجلسات المحجوزة...</p>
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
    <div className="p-0 md:p-8" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <h1 className="text-3xl font-bold text-blue-800">الجلسات المحجوزة</h1>
        <Button 
          variant="outline" 
          className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 flex items-center gap-1"
          onClick={fetchBookings}
        >
          <Calendar className="h-4 w-4" />
          <span>تحديث الجلسات</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              إجمالي الجلسات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{totalBookings}</div>
            <p className="text-xs text-muted-foreground">
              جلسة محجوزة
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-500" />
              الجلسات القادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {upcomingBookings}
            </div>
            <p className="text-xs text-muted-foreground">
              جلسة قادمة
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-purple-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-purple-500" />
              الجلسات المكتملة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {completedBookings}
            </div>
            <p className="text-xs text-muted-foreground">
              جلسة مكتملة
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-white to-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              الجلسات الملغاة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {cancelledBookings}
            </div>
            <p className="text-xs text-muted-foreground">
              جلسة ملغاة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card className="mb-8 border-0 shadow-sm overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500 h-4 w-4" />
                <Input
                  placeholder="البحث باسم المشارك، البريد الإلكتروني، أو رقم الهاتف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10 border-blue-100 focus:border-blue-300 rounded-full"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="border-blue-100 focus:border-blue-300">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-blue-500" />
                    <SelectValue placeholder="تصفية بالحالة" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="booked">محجوز</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bookings List */}
      {Object.keys(groupedBookings).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedBookings).map(([date, dateBookings]) => (
            <Card key={date} className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-2 bg-blue-50">
                <CardTitle className="text-lg font-medium text-blue-800 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  {date}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="border-collapse">
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead>المشارك</TableHead>
                      <TableHead>الوقت</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-left">التفاصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dateBookings.map((booking) => {
                      // Format times
                      const startDate = new Date(booking.availability.startTime);
                      const endDate = new Date(booking.availability.endTime);
                      const formattedStartTime = startDate.toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const formattedEndTime = endDate.toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <TableRow key={booking.id} className="hover:bg-gray-50 transition-colors duration-150">
                          <TableCell className="font-medium">
                            <div>{booking.participant.name}</div>
                            <div className="text-sm text-gray-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {booking.participant.email}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {booking.participant.phoneNumber}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-gray-500" />
                              <span>{formattedStartTime} - {formattedEndTime}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`
                              ${booking.status === 'booked' ? 'bg-green-100 text-green-800' : 
                                booking.status === 'cancelled' ? 'bg-red-100 text-red-800' : 
                                'bg-blue-100 text-blue-800'}
                            `}>
                              {booking.status === 'booked' ? 'محجوز' : 
                               booking.status === 'cancelled' ? 'ملغي' : 
                               booking.status === 'completed' ? 'مكتمل' : booking.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 justify-end">
                              {booking.meetingUrl && booking.status === 'booked' && (
                                <Button
                                  asChild
                                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                                >
                                  <a href={booking.meetingUrl} target="_blank" rel="noopener noreferrer">
                                    <Video className="h-4 w-4" />
                                    <span>دخول الاجتماع</span>
                                  </a>
                                </Button>
                              )}
                              <Button 
                                variant="outline" 
                                className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 flex items-center gap-1"
                                onClick={() => openDetailsDialog(booking)}
                              >
                                <User className="h-4 w-4" />
                                <span>التفاصيل</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <CalendarClock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">لا توجد جلسات محجوزة</p>
            <p className="text-gray-400 text-sm mt-2">
              {searchTerm || statusFilter !== 'all' 
                ? 'لا توجد نتائج مطابقة للبحث أو التصفية. يرجى تعديل معايير البحث.'
                : 'لم يتم حجز أي جلسات معك بعد.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Booking Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-md rounded-lg border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل الجلسة</DialogTitle>
            <DialogDescription>
              معلومات الجلسة المحجوزة والمشارك
            </DialogDescription>
          </DialogHeader>
          
          {selectedBooking && (
            <div className="space-y-4">
              {/* Participant Info */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  معلومات المشارك
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">الاسم:</span>
                    <span className="font-medium">{selectedBooking.participant.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">البريد الإلكتروني:</span>
                    <span>{selectedBooking.participant.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">رقم الهاتف:</span>
                    <span>{selectedBooking.participant.phoneNumber}</span>
                  </div>
                </div>
              </div>
              
              {/* Session Info */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  معلومات الجلسة
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">التاريخ:</span>
                    <span className="font-medium">
                      {new Date(selectedBooking.availability.startTime).toLocaleDateString('ar-SA', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">الوقت:</span>
                    <span>
                      {new Date(selectedBooking.availability.startTime).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} - {new Date(selectedBooking.availability.endTime).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">الحالة:</span>
                    <Badge className={`
                      ${selectedBooking.status === 'booked' ? 'bg-green-100 text-green-800' : 
                        selectedBooking.status === 'cancelled' ? 'bg-red-100 text-red-800' : 
                        'bg-blue-100 text-blue-800'}
                    `}>
                      {selectedBooking.status === 'booked' ? 'محجوز' : 
                       selectedBooking.status === 'cancelled' ? 'ملغي' : 
                       selectedBooking.status === 'completed' ? 'مكتمل' : selectedBooking.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">تاريخ الحجز:</span>
                    <span>
                      {new Date(selectedBooking.createdAt).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="border-gray-200"
                  onClick={() => setDetailsDialogOpen(false)}
                >
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
