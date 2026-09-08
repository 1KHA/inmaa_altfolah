"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Users, Loader2, Building, Video, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// No toast import needed

// Define the Event type from API
type EventFromAPI = {
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
};

// Define the Event type for UI display
type EventForDisplay = {
  id: string;
  name: string;
  type: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  locationType: string;
  facilitator: string;
  maxAttendees: number;
  status: string;
  plan: string;
  isRegistered?: boolean;
  registrationId?: string;
  registrationStatus?: string;
};

// Function to convert API event to display event
const convertEventForDisplay = (event: EventFromAPI): EventForDisplay => {
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  
  // Format date as YYYY-MM-DD
  const date = startDate.toISOString().split('T')[0];
  
  // Format times as HH:MM
  const startTime = startDate.toTimeString().substring(0, 5);
  const endTime = endDate.toTimeString().substring(0, 5);
  
  // Determine location type based on location string
  let locationType = "physical";
  if (event.location.includes("http") || event.location.includes("zoom") || event.location.includes("meet")) {
    locationType = "virtual";
  } else if (event.location.includes("online") || event.location.includes("إلكترون")) {
    locationType = "online";
  }
  
  return {
    id: event.id,
    name: event.title,
    type: event.type,
    description: event.description,
    date,
    startTime,
    endTime,
    location: event.location,
    locationType,
    facilitator: event.presenter,
    maxAttendees: event.capacity,
    status: event.status,
    plan: event.plan
  };
};

// Event types
const eventTypes = [
  { value: "workshop", label: "ورشة عمل" },
  { value: "talk", label: "محاضرة" },
  { value: "ceremony", label: "حفل" },
  { value: "mentoring", label: "جلسة إرشادية" },
  { value: "deadline", label: "موعد نهائي" },
  { value: "networking", label: "جلسة تواصل" },
];

// Status options
const statusOptions = [
  { value: "upcoming", label: "قادمة" },
  { value: "ongoing", label: "جارية" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
];

export default function ParticipantEventsPage() {
  const [events, setEvents] = useState<EventForDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventForDisplay | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState<string | null>(null);
  
  // Fetch events from API
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/events');
        
        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }
        
        const data = await response.json() as EventFromAPI[];
        const displayEvents = data.map(convertEventForDisplay);
        
        // Check registration status for each event
        const eventsWithRegistration = await Promise.all(
          displayEvents.map(async (event) => {
            try {
              const regResponse = await fetch(`/api/participant/register-event?eventId=${event.id}`);
              if (regResponse.ok) {
                const regData = await regResponse.json();
                return {
                  ...event,
                  isRegistered: regData.isRegistered,
                  registrationId: regData.isRegistered ? regData.registration.id : undefined,
                  registrationStatus: regData.isRegistered ? regData.registration.status : undefined,
                };
              }
            } catch (err) {
              console.error(`Error checking registration for event ${event.id}:`, err);
            }
            return event;
          })
        );
        
        setEvents(eventsWithRegistration);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvents();
  }, []);
  
  // Handle event registration
  const handleRegister = async (eventId: string) => {
    try {
      setRegistrationLoading(eventId);
      const response = await fetch('/api/participant/register-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventId }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'حدث خطأ أثناء التسجيل');
      }
      
      // Update the event in the list
      setEvents(events.map(event => 
        event.id === eventId 
          ? { 
              ...event, 
              isRegistered: true,
              registrationId: data.registration.id,
              registrationStatus: data.registration.status
            } 
          : event
      ));
      
      // Update the selected event if it's open
      if (selectedEvent && selectedEvent.id === eventId) {
        setSelectedEvent({
          ...selectedEvent,
          isRegistered: true,
          registrationId: data.registration.id,
          registrationStatus: data.registration.status
        });
      }
      
      // Show success message
      console.log("تم التسجيل بنجاح:", data.message);
      // You can add a UI notification here if needed
    } catch (err) {
      console.error('Error registering for event:', err);
      // Show error message
      console.error("خطأ في التسجيل:", err instanceof Error ? err.message : 'حدث خطأ أثناء التسجيل');
      // You can add a UI notification here if needed
    } finally {
      setRegistrationLoading(null);
    }
  };
  
  // Handle cancelling registration
  const handleCancelRegistration = async (eventId: string) => {
    try {
      setRegistrationLoading(eventId);
      const response = await fetch('/api/participant/register-event', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventId }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'حدث خطأ أثناء إلغاء التسجيل');
      }
      
      // Update the event in the list
      setEvents(events.map(event => 
        event.id === eventId 
          ? { 
              ...event, 
              isRegistered: false,
              registrationId: undefined,
              registrationStatus: undefined
            } 
          : event
      ));
      
      // Update the selected event if it's open
      if (selectedEvent && selectedEvent.id === eventId) {
        setSelectedEvent({
          ...selectedEvent,
          isRegistered: false,
          registrationId: undefined,
          registrationStatus: undefined
        });
      }
      
      // Show success message
      console.log("تم إلغاء التسجيل:", data.message);
      // You can add a UI notification here if needed
    } catch (err) {
      console.error('Error cancelling registration:', err);
      // Show error message
      console.error("خطأ في إلغاء التسجيل:", err instanceof Error ? err.message : 'حدث خطأ أثناء إلغاء التسجيل');
      // You can add a UI notification here if needed
    } finally {
      setRegistrationLoading(null);
    }
  };
  
  // Format date to Arabic format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "d MMMM yyyy", { locale: ar });
  };
  
  // Get event type color
  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "workshop":
        return "bg-blue-100 text-blue-800";
      case "talk":
        return "bg-purple-100 text-purple-800";
      case "ceremony":
        return "bg-green-100 text-green-800";
      case "mentoring":
        return "bg-yellow-100 text-yellow-800";
      case "deadline":
        return "bg-red-100 text-red-800";
      case "networking":
        return "bg-indigo-100 text-indigo-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  // Get event type label
  const getEventTypeLabel = (type: string) => {
    const typeObj = eventTypes.find((t) => t.value === type);
    return typeObj ? typeObj.label : type;
  };
  
  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "upcoming":
        return "bg-blue-100 text-blue-800";
      case "ongoing":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  // Get status label
  const getStatusLabel = (status: string) => {
    const statusObj = statusOptions.find((s) => s.value === status);
    return statusObj ? statusObj.label : status;
  };
  
  // Get location icon
  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case "physical":
        return <Building className="h-4 w-4" />;
      case "virtual":
        return <Video className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };
  
  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">الفعاليات</h1>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-600">
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {events.length > 0 ? (
            events.map((event) => (
              <Card key={event.id} className="overflow-hidden">
                <div className="p-4 sm:p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-semibold">{event.name}</h3>
                        <Badge className={getEventTypeColor(event.type)}>
                          {getEventTypeLabel(event.type)}
                        </Badge>
                      </div>
                    </div>
                    <Badge className={getStatusColor(event.status)}>
                      {getStatusLabel(event.status)}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">{event.description}</p>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{event.startTime} - {event.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getLocationIcon(event.locationType)}
                      <span>{event.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>المقدم: {event.facilitator}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex flex-col sm:flex-row sm:justify-between">
                    <div className="mb-2 sm:mb-0">
                      {event.isRegistered ? (
                        <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>مسجل</span>
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {event.status === 'upcoming' && (
                        event.isRegistered ? (
                          <Button 
                            variant="outline" 
                            onClick={() => handleCancelRegistration(event.id)}
                            disabled={registrationLoading === event.id}
                            className="w-full sm:w-auto"
                          >
                            {registrationLoading === event.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'إلغاء التسجيل'
                            )}
                          </Button>
                        ) : (
                          <Button 
                            onClick={() => handleRegister(event.id)}
                            disabled={registrationLoading === event.id}
                            className="w-full sm:w-auto"
                          >
                            {registrationLoading === event.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'تسجيل'
                            )}
                          </Button>
                        )
                      )}
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedEvent(event)}
                        className="w-full sm:w-auto"
                      >
                        عرض التفاصيل
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-12 col-span-2">
              <p className="text-muted-foreground">
                لا توجد فعاليات مجدولة حالياً.
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Event Details Dialog */}
      <Dialog 
        open={!!selectedEvent} 
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل الفعالية</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">معلومات الفعالية</h3>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm text-gray-500">الاسم:</span>
                      <p className="font-medium">{selectedEvent.name}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">النوع:</span>
                      <Badge className={`mr-2 ${getEventTypeColor(selectedEvent.type)}`}>
                        {getEventTypeLabel(selectedEvent.type)}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">الوصف:</span>
                      <p className="text-sm">{selectedEvent.description}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">التوقيت والمكان</h3>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm text-gray-500">التاريخ:</span>
                      <p className="font-medium">{formatDate(selectedEvent.date)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">الوقت:</span>
                      <p className="font-medium">
                        {selectedEvent.startTime} - {selectedEvent.endTime}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">المكان:</span>
                      <div className="flex items-center gap-2 mt-1">
                        {getLocationIcon(selectedEvent.locationType)}
                        <p className="font-medium">{selectedEvent.location}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">معلومات إضافية</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-500">المسؤول</p>
                    <p className="font-medium">{selectedEvent.facilitator}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-500">الحالة</p>
                    <Badge className={getStatusColor(selectedEvent.status)}>
                      {getStatusLabel(selectedEvent.status)}
                    </Badge>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-500">السعة</p>
                    <p className="font-medium">{selectedEvent.maxAttendees}</p>
                  </div>
                </div>
              </div>
              
              {selectedEvent.plan && (
                <div>
                  <h3 className="font-semibold mb-2">خطة الفعالية</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm">{selectedEvent.plan}</p>
                  </div>
                </div>
              )}
              
              <div className="mt-6 flex justify-end">
                {selectedEvent.status === 'upcoming' && (
                  selectedEvent.isRegistered ? (
                    <Button 
                      variant="outline" 
                      onClick={() => handleCancelRegistration(selectedEvent.id)}
                      disabled={registrationLoading === selectedEvent.id}
                      className="w-full sm:w-auto"
                    >
                      {registrationLoading === selectedEvent.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      إلغاء التسجيل
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleRegister(selectedEvent.id)}
                      disabled={registrationLoading === selectedEvent.id}
                      className="w-full sm:w-auto"
                    >
                      {registrationLoading === selectedEvent.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      تسجيل
                    </Button>
                  )
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
