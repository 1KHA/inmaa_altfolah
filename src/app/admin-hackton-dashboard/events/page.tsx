"use client";

import { useState, useEffect } from "react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../../../../components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Filter,
  MoreVertical,
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  Edit,
  Trash,
  Bell,
  Download,
  Eye,
  CalendarDays,
  List,
  Video,
  Building,
  UserCheck,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  CheckCircle2,
} from "lucide-react";

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
  nameEn?: string;
  type: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  locationType: string;
  facilitator: string;
  maxAttendees: number;
  registeredAttendees: number;
  status: string;
  attendanceMarked: boolean;
  plan: string;
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
    nameEn: "", // No English name in the API data
    type: event.type,
    description: event.description,
    date,
    startTime,
    endTime,
    location: event.location,
    locationType,
    facilitator: event.presenter,
    maxAttendees: event.capacity,
    registeredAttendees: 0, // No registered attendees count in the API data
    status: event.status,
    attendanceMarked: false, // No attendance marking in the API data
    plan: event.plan
  };
};

const eventTypes = [
  { value: "all", label: "جميع الأنواع" },
  { value: "workshop", label: "ورشة عمل" },
  { value: "talk", label: "محاضرة" },
  { value: "ceremony", label: "حفل" },
  { value: "mentoring", label: "جلسة إرشادية" },
  { value: "deadline", label: "موعد نهائي" },
  { value: "networking", label: "جلسة تواصل" },
];

const statusOptions = [
  { value: "all", label: "جميع الحالات" },
  { value: "upcoming", label: "قادمة" },
  { value: "ongoing", label: "جارية" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
];

export default function EventsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<EventForDisplay | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("list");
  
  // State for real events from API
  const [events, setEvents] = useState<EventForDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  
  // State for global export
  const [isExportingAll, setIsExportingAll] = useState(false);
  
  // State for delete confirmation dialog
  const [isDeleteConfirmDialogOpen, setIsDeleteConfirmDialogOpen] = useState(false);
  const [remindingEventId, setRemindingEventId] = useState<string | null>(null);
  // Reminder confirmation dialog. A reminder is irreversible and goes to
  // everyone at once, so it is never sent straight from a menu click.
  const [reminderTarget, setReminderTarget] = useState<{ id: string; name: string } | null>(null);
  const [reminderPreview, setReminderPreview] = useState<{
    recipientCount: number;
    lastReminderAt: string | null;
    cooldownMinutes: number;
  } | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  
  // State for edit dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<EventForDisplay | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  
  // State for registrations dialog
  const [isRegistrationsDialogOpen, setIsRegistrationsDialogOpen] = useState(false);
  const [selectedEventForRegistrations, setSelectedEventForRegistrations] = useState<EventForDisplay | null>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [isLoadingRegistrations, setIsLoadingRegistrations] = useState(false);
  const [registrationsError, setRegistrationsError] = useState("");
  const [searchRegistrationTerm, setSearchRegistrationTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Function to fetch events from API
  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/events');
      
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      
      const data = await response.json() as EventFromAPI[];
      const displayEvents = data.map(convertEventForDisplay);
      
      // Fetch registration counts for each event
      const eventsWithRegistrations = await Promise.all(
        displayEvents.map(async (event) => {
          try {
            const regResponse = await fetch(`/api/admin/event-registrations/${event.id}`);
            if (regResponse.ok) {
              const regData = await regResponse.json();
              return {
                ...event,
                registeredAttendees: regData.registrations.length
              };
            }
            return event;
          } catch (err) {
            console.error(`Error fetching registrations for event ${event.id}:`, err);
            return event;
          }
        })
      );
      
      setEvents(eventsWithRegistrations);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch events on component mount
  useEffect(() => {
    fetchEvents();
  }, []);
  
  // Open delete confirmation dialog
  const openDeleteConfirmDialog = (eventId: string) => {
    setEventToDelete(eventId);
    setIsDeleteConfirmDialogOpen(true);
  };
  
  // Handle event deletion
  const handleDeleteEvent = async (eventId: string) => {
    try {
      setIsDeleting(true);
      setDeleteError("");
      
      const response = await fetch('/api/admin/events', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: eventId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء حذف الفعالية');
      }
      
      // Remove the deleted event from the state
      setEvents(prev => prev.filter(event => event.id !== eventId));
      
      // Close the event details dialog if it's open
      if (selectedEvent && selectedEvent.id === eventId) {
        setSelectedEvent(null);
      }
      
      // Close the delete confirmation dialog
      setIsDeleteConfirmDialogOpen(false);
      setEventToDelete(null);
      
    } catch (err: any) {
      setDeleteError(err.message || 'حدث خطأ أثناء حذف الفعالية');
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Handle opening edit dialog
  /**
   * Step 1 — open the confirmation dialog and fetch a preview (how many people
   * would be notified, and whether a reminder went out recently).
   */
  const openReminderDialog = async (eventId: string, eventName: string) => {
    setReminderTarget({ id: eventId, name: eventName });
    setReminderPreview(null);
    setReminderLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/remind`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setReminderPreview(data);
    } catch {
      /* the dialog still works; it just cannot show a count */
    } finally {
      setReminderLoading(false);
    }
  };

  /**
   * Step 2 — actually send. `force` re-sends inside the server's cooldown,
   * which is only offered after the server refuses with 409.
   */
  const confirmSendReminder = async (force = false) => {
    if (!reminderTarget) return;
    const { id, name } = reminderTarget;
    try {
      setRemindingEventId(id);
      const res = await fetch(`/api/admin/events/${id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force }),
      });
      const data = await res.json();

      if (res.status === 409 && data.cooldown) {
        // Keep the dialog open and let the admin decide to send anyway.
        setReminderPreview((prev) =>
          prev ? { ...prev, lastReminderAt: data.lastReminderAt } : prev
        );
        toast({ title: 'تم الإرسال مؤخراً', description: data.error, variant: 'destructive' });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'فشل إرسال التذكير');

      toast({
        title: 'تم إرسال التذكير',
        description: `تم إشعار ${data.recipientCount} مشارك مسجل في «${name}» عبر لوحة التحكم والبريد الإلكتروني`,
      });
      setReminderTarget(null);
      setReminderPreview(null);
    } catch (err) {
      toast({
        title: 'خطأ',
        description: err instanceof Error ? err.message : 'فشل إرسال التذكير',
        variant: 'destructive',
      });
    } finally {
      setRemindingEventId(null);
    }
  };

  const handleEditEvent = (event: EventForDisplay) => {
    setEventToEdit(event);
    setIsEditDialogOpen(true);
    // Close the event details dialog if it's open
    if (selectedEvent) {
      setSelectedEvent(null);
    }
  };
  
  // Handle viewing registrations
  const handleViewRegistrations = async (event: EventForDisplay) => {
    try {
      setIsLoadingRegistrations(true);
      setRegistrationsError("");
      setSelectedEventForRegistrations(event);
      setIsRegistrationsDialogOpen(true);
      
      const response = await fetch(`/api/admin/event-registrations/${event.id}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء جلب المشاركين');
      }
      
      const data = await response.json();
      setRegistrations(data.registrations);
    } catch (err: any) {
      setRegistrationsError(err.message || 'حدث خطأ أثناء جلب المشاركين');
    } finally {
      setIsLoadingRegistrations(false);
    }
  };
  
  // Handle marking attendance
  const handleMarkAttendance = async (registrationId: string) => {
    try {
      if (!selectedEventForRegistrations) return;
      
      const response = await fetch(`/api/admin/event-registrations/${selectedEventForRegistrations.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId,
          status: 'attended',
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء تسجيل الحضور');
      }
      
      // Update the registrations list
      setRegistrations(registrations.map(reg => 
        reg.id === registrationId 
          ? { ...reg, status: 'attended' } 
          : reg
      ));
      
    } catch (err: any) {
      console.error("خطأ في تسجيل الحضور:", err.message);
    }
  };
  
  // Handle marking as absent
  const handleMarkAbsent = async (registrationId: string) => {
    try {
      if (!selectedEventForRegistrations) return;
      
      const response = await fetch(`/api/admin/event-registrations/${selectedEventForRegistrations.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId,
          status: 'absent',
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء تسجيل عدم الحضور');
      }
      
      // Update the registrations list
      setRegistrations(registrations.map(reg => 
        reg.id === registrationId 
          ? { ...reg, status: 'absent' } 
          : reg
      ));
      
    } catch (err: any) {
      console.error("خطأ في تسجيل عدم الحضور:", err.message);
    }
  };
  
  // Handle cancelling registration
  const handleCancelRegistration = async (registrationId: string) => {
    try {
      if (!selectedEventForRegistrations) return;
      
      const response = await fetch(`/api/admin/event-registrations/${selectedEventForRegistrations.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء إلغاء التسجيل');
      }
      
      // Update the registrations list
      setRegistrations(registrations.filter(reg => reg.id !== registrationId));
      
    } catch (err: any) {
      console.error("خطأ في إلغاء التسجيل:", err.message);
    }
  };
  
  // Handle exporting registrations for a single event
  const handleExportRegistrations = () => {
    if (!registrations.length || !selectedEventForRegistrations) return;
    
    // Create CSV content
    const headers = ["الاسم", "البريد الإلكتروني", "رقم الهاتف", "قائد الفريق", "حالة التسجيل", "تاريخ التسجيل"];
    const rows = registrations.map(reg => [
      reg.participant.name,
      reg.participant.email,
      reg.participant.phone,
      reg.participant.isLeader ? "نعم" : "لا",
      reg.status === "registered" ? "مسجل" : reg.status === "attended" ? "حضر" : reg.status === "absent" ? "لم يحضر" : "ملغي",
      new Date(reg.registeredAt).toLocaleDateString("ar-SA")
    ]);
    
    // Add UTF-8 BOM to ensure Excel correctly displays Arabic text
    const BOM = "\uFEFF";
    const csvContent = BOM + [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    // Create a download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `مشاركو-${selectedEventForRegistrations.name}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Handle exporting all events and participants
  const handleExportAllEvents = async () => {
    try {
      setIsExportingAll(true);
      
      // Fetch all events if not already loaded
      if (events.length === 0) {
        await fetchEvents();
      }
      
      // Create headers for the CSV
      const headers = [
        "اسم الفعالية", 
        "نوع الفعالية", 
        "وصف الفعالية", 
        "تاريخ الفعالية", 
        "وقت البداية", 
        "وقت النهاية", 
        "المكان", 
        "الحالة", 
        "الخطة", 
        "المسؤول", 
        "السعة", 
        "اسم المشارك", 
        "البريد الإلكتروني", 
        "رقم الهاتف", 
        "معرف الفريق", 
        "قائد الفريق", 
        "حالة التسجيل", 
        "تاريخ التسجيل"
      ];
      
      // Array to store all rows
      const allRows: string[][] = [];
      
      // Process each event
      for (const event of events) {
        // Fetch registrations for this event
        const response = await fetch(`/api/admin/event-registrations/${event.id}`);
        
        if (!response.ok) {
          console.error(`Failed to fetch registrations for event ${event.id}`);
          continue;
        }
        
        const data = await response.json();
        const eventRegistrations = data.registrations;
        
        // If no registrations, add a row with just event details
        if (eventRegistrations.length === 0) {
          allRows.push([
            event.name,
            getEventTypeLabel(event.type),
            event.description,
            event.date,
            event.startTime,
            event.endTime,
            event.location,
            getStatusLabel(event.status),
            event.plan || "",
            event.facilitator,
            event.maxAttendees.toString(),
            "", // No participant
            "",
            "",
            "",
            "",
            "",
            ""
          ]);
        } else {
          // Add a row for each registration
          for (const reg of eventRegistrations) {
            allRows.push([
              event.name,
              getEventTypeLabel(event.type),
              event.description,
              event.date,
              event.startTime,
              event.endTime,
              event.location,
              getStatusLabel(event.status),
              event.plan || "",
              event.facilitator,
              event.maxAttendees.toString(),
              reg.participant.name,
              reg.participant.email,
              reg.participant.phone,
              reg.participant.teamId || "",
              reg.participant.isLeader ? "نعم" : "لا",
              reg.status === "registered" ? "مسجل" : 
                reg.status === "attended" ? "حضر" : 
                reg.status === "absent" ? "لم يحضر" : "ملغي",
              new Date(reg.registeredAt).toLocaleDateString("ar-SA")
            ]);
          }
        }
      }
      
      // Add UTF-8 BOM to ensure Excel correctly displays Arabic text
      const BOM = "\uFEFF";
      const csvContent = BOM + [
        headers.join(","),
        ...allRows.map(row => row.map(cell => 
          // Escape cells that contain commas, quotes, or newlines
          cell.includes(",") || cell.includes("\"") || cell.includes("\n") 
            ? `"${cell.replace(/"/g, '""')}"` 
            : cell
        ).join(","))
      ].join("\n");
      
      // Create a download link
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `جميع-الفعاليات-والمشاركين.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error("Error exporting all events:", error);
    } finally {
      setIsExportingAll(false);
    }
  };
  
  // Handle event update
  const handleUpdateEvent = async () => {
    if (!eventToEdit) return;
    
    setIsUpdating(true);
    setUpdateError("");
    
    try {
      // Prepare the event data for API
      const eventData = {
        id: eventToEdit.id,
        title: eventToEdit.name,
        description: eventToEdit.description,
        startDate: new Date(`${eventToEdit.date}T${eventToEdit.startTime || '00:00'}`).toISOString(),
        endDate: new Date(`${eventToEdit.date}T${eventToEdit.endTime || '23:59'}`).toISOString(),
        location: eventToEdit.location,
        capacity: eventToEdit.maxAttendees,
        type: eventToEdit.type,
        plan: eventToEdit.plan || "لا توجد خطة محددة",
        presenter: eventToEdit.facilitator,
        status: eventToEdit.status
      };
      
      // Call the API
      const response = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء تحديث الفعالية');
      }
      
      // Reset form and close dialog on success
      setEventToEdit(null);
      setIsEditDialogOpen(false);
      
      // Refresh events list
      fetchEvents();
      
    } catch (err: any) {
      setUpdateError(err.message || 'حدث خطأ أثناء تحديث الفعالية');
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Handle edit form input changes
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setEventToEdit(prev => {
      if (!prev) return prev;
      
      // Handle different field mappings between form and display model
      if (id === "title") {
        return { ...prev, name: value };
      } else if (id === "presenter") {
        return { ...prev, facilitator: value };
      } else if (id === "capacity") {
        return { ...prev, maxAttendees: parseInt(value) || 0 };
      } else {
        return { ...prev, [id]: value };
      }
    });
  };
  
  // Handle edit form select changes
  const handleEditSelectChange = (id: string, value: string) => {
    setEventToEdit(prev => {
      if (!prev) return prev;
      return { ...prev, [id]: value };
    });
  };
  
  // Form state for new event
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    location: "",
    capacity: 0,
    type: "",
    plan: "",
    presenter: "",
    status: "upcoming"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setNewEvent(prev => ({
      ...prev,
      [id]: value
    }));
  };
  
  // Handle select changes
  const handleSelectChange = (id: string, value: string) => {
    setNewEvent(prev => ({
      ...prev,
      [id]: value
    }));
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError("");
    
    try {
      // Prepare the event data
      const eventData = {
        title: newEvent.title,
        description: newEvent.description,
        startDate: new Date(`${newEvent.startDate}T${newEvent.startTime || '00:00'}`).toISOString(),
        endDate: new Date(`${newEvent.endDate || newEvent.startDate}T${newEvent.endTime || '23:59'}`).toISOString(),
        location: newEvent.location,
        capacity: parseInt(newEvent.capacity.toString()) || 0,
        type: newEvent.type,
        plan: newEvent.plan || "لا توجد خطة محددة",
        presenter: newEvent.presenter,
        status: newEvent.status
      };
      
      // Call the API
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'حدث خطأ أثناء إضافة الفعالية');
      }
      
      // Reset form and close dialog on success
      setNewEvent({
        title: "",
        description: "",
        startDate: "",
        startTime: "",
        endDate: "",
        endTime: "",
        location: "",
        capacity: 0,
        type: "",
        plan: "",
        presenter: "",
        status: "upcoming"
      });
      setIsCreateDialogOpen(false);
      
      // Reload events (in a real app, you would update the state with the new event)
      // For now, we'll just reload the page to show the updated data
      window.location.reload();
      
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إضافة الفعالية');
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const getEventTypeLabel = (type: string) => {
    const typeObj = eventTypes.find((t) => t.value === type);
    return typeObj ? typeObj.label : type;
  };

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

  const getStatusLabel = (status: string) => {
    const statusObj = statusOptions.find((s) => s.value === status);
    return statusObj ? statusObj.label : status;
  };

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

  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.nameEn?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      event.facilitator.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || event.type === selectedType;
    const matchesStatus = selectedStatus === "all" || event.status === selectedStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="p-0 md:p-8" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">إدارة الفعاليات</h1>
        <p className="text-gray-600">جدولة وإدارة جميع فعاليات الهاكاثون</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الفعاليات</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
            <p className="text-xs text-muted-foreground">في قاعدة البيانات</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">فعاليات قادمة</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {events.filter(e => e.status === "upcoming").length}
            </div>
            <p className="text-xs text-muted-foreground">بانتظار التنفيذ</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">فعاليات جارية</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {events.filter(e => e.status === "ongoing").length}
            </div>
            <p className="text-xs text-muted-foreground">قيد التنفيذ حالياً</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">فعاليات مكتملة</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {events.filter(e => e.status === "completed").length}
            </div>
            <p className="text-xs text-muted-foreground">تم تنفيذها بنجاح</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions and View Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة فعالية جديدة
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportAllEvents}
            disabled={isExportingAll}
            title="تصدير جميع الفعاليات وجميع المشاركين في ملف واحد متوافق مع Excel"
          >
            <Download className="ml-2 h-4 w-4" />
            {isExportingAll ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري التصدير...
              </>
            ) : (
              "تصدير جميع الفعاليات والمشاركين (Excel)"
            )}
          </Button>
        </div>
        <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
          <TabsList>
            <TabsTrigger value="list">
              <List className="ml-2 h-4 w-4" />
              قائمة
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <Calendar className="ml-2 h-4 w-4" />
              تقويم
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="البحث عن فعالية أو متحدث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </div>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="نوع الفعالية" />
          </SelectTrigger>
          <SelectContent>
            {eventTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
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
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline">
          <Filter className="ml-2 h-4 w-4" />
          المزيد من الفلاتر
        </Button>
      </div>

      {/* Events View */}
      {viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <span className="mr-2">جاري تحميل الفعاليات...</span>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">لا توجد فعاليات</p>
                <p className="text-sm mt-2">قم بإضافة فعالية جديدة باستخدام الزر أعلاه</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الفعالية</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">التاريخ والوقت</TableHead>
                    <TableHead className="text-right">المكان</TableHead>
                    <TableHead className="text-right">المسؤول</TableHead>
                    <TableHead className="text-right">السعة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div>
                        <div className="font-semibold">{event.name}</div>
                        <div className="text-sm text-gray-500">{event.nameEn}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getEventTypeColor(event.type)}>
                        {getEventTypeLabel(event.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-gray-500" />
                        <div>
                          <div>{event.date}</div>
                          <div className="text-sm text-gray-500">
                            {event.startTime} - {event.endTime}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getLocationIcon(event.locationType)}
                        <span className="text-sm">{event.location}</span>
                      </div>
                    </TableCell>
                    <TableCell>{event.facilitator}</TableCell>
                    <TableCell>
                      {event.maxAttendees > 0 ? (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">
                            {event.registeredAttendees}/{event.maxAttendees}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(event.status)}>
                        {getStatusLabel(event.status)}
                      </Badge>
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
                          <DropdownMenuItem onClick={() => setSelectedEvent(event)}>
                            <Eye className="ml-2 h-4 w-4" />
                            عرض التفاصيل
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewRegistrations(event)}>
                            <Users className="ml-2 h-4 w-4" />
                            عرض المشاركين
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditEvent(event)}>
                            <Edit className="ml-2 h-4 w-4" />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              openReminderDialog(event.id, event.name);
                            }}
                          >
                            <Bell className="ml-2 h-4 w-4" />
                            إرسال تذكير
                          </DropdownMenuItem>
                          {event.status === "completed" && !event.attendanceMarked && (
                            <DropdownMenuItem>
                              <UserCheck className="ml-2 h-4 w-4" />
                              تسجيل الحضور
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => openDeleteConfirmDialog(event.id)}
                          >
                            <Trash className="ml-2 h-4 w-4" />
                            حذف الفعالية
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-12 text-gray-500">
              <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">عرض التقويم قيد التطوير</p>
              <p className="text-sm mt-2">سيتم إضافة عرض التقويم الشهري قريباً</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Details Dialog */}
      <Dialog 
        open={!!selectedEvent} 
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-w-3xl" dir="rtl">
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
                      <p className="text-sm text-gray-500">{selectedEvent.nameEn}</p>
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
                      <p className="font-medium">{selectedEvent.date}</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                    <p className="text-sm text-gray-500">الحضور</p>
                    {selectedEvent.maxAttendees > 0 ? (
                      <p className="font-medium">
                        {selectedEvent.registeredAttendees}/{selectedEvent.maxAttendees}
                      </p>
                    ) : (
                      <p className="font-medium">غير محدود</p>
                    )}
                  </div>
                </div>
              </div>

              {selectedEvent.status === "completed" && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2">
                    {selectedEvent.attendanceMarked ? (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="text-green-600">تم تسجيل الحضور</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                        <span className="text-yellow-600">لم يتم تسجيل الحضور بعد</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => handleViewRegistrations(selectedEvent)}>
                  <Users className="ml-2 h-4 w-4" />
                  عرض المشاركين
                </Button>
                <Button variant="outline" onClick={() => handleEditEvent(selectedEvent)}>
                  <Edit className="ml-2 h-4 w-4" />
                  تعديل
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openReminderDialog(selectedEvent.id, selectedEvent.name)}
                >
                  <Bell className="ml-2 h-4 w-4" />
                  إرسال تذكير
                </Button>
                {selectedEvent.status === "completed" && !selectedEvent.attendanceMarked && (
                  <Button>
                    <UserCheck className="ml-2 h-4 w-4" />
                    تسجيل الحضور
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  onClick={() => openDeleteConfirmDialog(selectedEvent.id)}
                  disabled={isDeleting}
                >
                  <Trash className="ml-2 h-4 w-4" />
                  {isDeleting ? 'جاري الحذف...' : 'حذف الفعالية'}
                </Button>
              </div>
              
              {deleteError && (
                <div className="mt-4 bg-red-50 text-red-600 p-3 rounded-md">
                  {deleteError}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEventToEdit(null);
          setUpdateError("");
        }
        setIsEditDialogOpen(open);
      }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الفعالية</DialogTitle>
            <DialogDescription>تعديل تفاصيل الفعالية</DialogDescription>
          </DialogHeader>
          
          {updateError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
              {updateError}
            </div>
          )}
          
          {eventToEdit && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">اسم الفعالية</Label>
                  <Input 
                    id="title" 
                    placeholder="أدخل اسم الفعالية" 
                    value={eventToEdit.name}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="presenter">المسؤول عن الفعالية</Label>
                  <Input 
                    id="presenter" 
                    placeholder="اسم المتحدث أو المسؤول" 
                    value={eventToEdit.facilitator}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">نوع الفعالية</Label>
                  <Select 
                    value={eventToEdit.type} 
                    onValueChange={(value) => handleEditSelectChange("type", value)}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="اختر نوع الفعالية" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.slice(1).map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan">خطة الفعالية</Label>
                  <Input 
                    id="plan" 
                    placeholder="خطة الفعالية" 
                    value={eventToEdit.plan}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">وصف الفعالية</Label>
                <Textarea
                  id="description"
                  placeholder="أدخل وصف مختصر للفعالية"
                  rows={3}
                  value={eventToEdit.description}
                  onChange={handleEditInputChange}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">تاريخ الفعالية</Label>
                  <Input 
                    id="date" 
                    type="date" 
                    value={eventToEdit.date}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startTime">وقت البداية</Label>
                  <Input 
                    id="startTime" 
                    type="time" 
                    value={eventToEdit.startTime}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">وقت النهاية</Label>
                  <Input 
                    id="endTime" 
                    type="time" 
                    value={eventToEdit.endTime}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">المكان</Label>
                  <Input 
                    id="location" 
                    placeholder="القاعة أو رابط الاجتماع" 
                    value={eventToEdit.location}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">سعة الحضور</Label>
                  <Input
                    id="capacity"
                    type="number"
                    placeholder="أدخل سعة الحضور"
                    value={eventToEdit.maxAttendees}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">حالة الفعالية</Label>
                <Select 
                  value={eventToEdit.status} 
                  onValueChange={(value) => handleEditSelectChange("status", value)}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="اختر حالة الفعالية" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.slice(1).map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleUpdateEvent} 
              disabled={isUpdating}
            >
              {isUpdating ? 'جاري التحديث...' : 'تحديث الفعالية'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create Event Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة فعالية جديدة</DialogTitle>
            <DialogDescription>أدخل تفاصيل الفعالية الجديدة</DialogDescription>
          </DialogHeader>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
              {error}
            </div>
          )}
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">اسم الفعالية</Label>
                <Input 
                  id="title" 
                  placeholder="أدخل اسم الفعالية" 
                  value={newEvent.title}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="presenter">المسؤول عن الفعالية</Label>
                <Input 
                  id="presenter" 
                  placeholder="اسم المتحدث أو المسؤول" 
                  value={newEvent.presenter}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">نوع الفعالية</Label>
                <Select onValueChange={(value) => handleSelectChange("type", value)}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="اختر نوع الفعالية" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.slice(1).map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan">خطة الفعالية</Label>
                <Input 
                  id="plan" 
                  placeholder="خطة الفعالية" 
                  value={newEvent.plan}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">وصف الفعالية</Label>
              <Textarea
                id="description"
                placeholder="أدخل وصف مختصر للفعالية"
                rows={3}
                value={newEvent.description}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">تاريخ البداية</Label>
                <Input 
                  id="startDate" 
                  type="date" 
                  value={newEvent.startDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">وقت البداية</Label>
                <Input 
                  id="startTime" 
                  type="time" 
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">تاريخ النهاية</Label>
                <Input 
                  id="endDate" 
                  type="date" 
                  value={newEvent.endDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="endTime">وقت النهاية</Label>
                <Input 
                  id="endTime" 
                  type="time" 
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">المكان</Label>
                <Input 
                  id="location" 
                  placeholder="القاعة أو رابط الاجتماع" 
                  value={newEvent.location}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">سعة الحضور</Label>
              <Input
                id="capacity"
                type="number"
                placeholder="أدخل سعة الحضور"
                value={newEvent.capacity || ""}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ الفعالية'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Registrations Dialog */}
      <Dialog 
        open={isRegistrationsDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setIsRegistrationsDialogOpen(false);
            setSelectedEventForRegistrations(null);
            setRegistrations([]);
            setSearchRegistrationTerm("");
            setStatusFilter("all");
          }
        }}
      >
        <DialogContent className="max-w-4xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              المشاركون المسجلون في الفعالية
              {selectedEventForRegistrations && (
                <span className="text-primary"> - {selectedEventForRegistrations.name}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              قائمة المشاركين المسجلين في هذه الفعالية
            </DialogDescription>
          </DialogHeader>
          
          {registrationsError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
              {registrationsError}
            </div>
          )}
          
          {isLoadingRegistrations ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">لا يوجد مشاركون مسجلون</p>
              <p className="text-sm mt-2">لم يقم أي مشارك بالتسجيل في هذه الفعالية بعد</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-sm text-gray-500">إجمالي المسجلين:</span>
                  <span className="font-bold mr-1">{registrations.length}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportRegistrations}>
                  <Download className="ml-2 h-4 w-4" />
                  تصدير القائمة
                </Button>
              </div>
              
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="البحث عن مشارك..."
                      value={searchRegistrationTerm}
                      onChange={(e) => setSearchRegistrationTerm(e.target.value)}
                      className="pr-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="حالة التسجيل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="registered">مسجل</SelectItem>
                    <SelectItem value="attended">حضر</SelectItem>
                    <SelectItem value="absent">لم يحضر</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم المشارك</TableHead>
                    <TableHead className="text-right">البريد الإلكتروني</TableHead>
                    <TableHead className="text-right">رقم الهاتف</TableHead>
                    <TableHead className="text-right">قائد الفريق</TableHead>
                    <TableHead className="text-right">حالة التسجيل</TableHead>
                    <TableHead className="text-right">تاريخ التسجيل</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations
                    .filter(reg => {
                      const matchesSearch = 
                        reg.participant.name.toLowerCase().includes(searchRegistrationTerm.toLowerCase()) ||
                        reg.participant.email.toLowerCase().includes(searchRegistrationTerm.toLowerCase());
                      
                      const matchesStatus = 
                        statusFilter === "all" || 
                        reg.status === statusFilter;
                      
                      return matchesSearch && matchesStatus;
                    })
                    .map((registration) => (
                    <TableRow key={registration.id}>
                      <TableCell className="font-medium">
                        {registration.participant.name}
                      </TableCell>
                      <TableCell>{registration.participant.email}</TableCell>
                      <TableCell>{registration.participant.phone}</TableCell>
                      <TableCell>
                        {registration.participant.isLeader ? (
                          <Badge className="bg-green-100 text-green-800">نعم</Badge>
                        ) : (
                          <span className="text-gray-500">لا</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            registration.status === "registered" 
                              ? "bg-blue-100 text-blue-800" 
                              : registration.status === "attended" 
                              ? "bg-green-100 text-green-800" 
                              : registration.status === "absent"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {registration.status === "registered" 
                            ? "مسجل" 
                            : registration.status === "attended" 
                            ? "حضر" 
                            : registration.status === "absent"
                            ? "لم يحضر"
                            : "ملغي"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(registration.registeredAt).toLocaleDateString("ar-SA")}
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
                            {registration.status === "registered" && (
                              <DropdownMenuItem onClick={() => handleMarkAttendance(registration.id)}>
                                <CheckCircle2 className="ml-2 h-4 w-4" />
                                تسجيل الحضور
                              </DropdownMenuItem>
                            )}
                            {(registration.status === "registered" || registration.status === "attended") && (
                              <DropdownMenuItem onClick={() => handleMarkAbsent(registration.id)}>
                                <AlertCircle className="ml-2 h-4 w-4" />
                                عدم الحضور
                              </DropdownMenuItem>
                            )}
                            {registration.status !== "cancelled" && (
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => handleCancelRegistration(registration.id)}
                              >
                                <X className="ml-2 h-4 w-4" />
                                إلغاء التسجيل
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={reminderTarget !== null}
        onOpenChange={(open) => {
          if (!open && !remindingEventId) {
            setReminderTarget(null);
            setReminderPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد إرسال التذكير</DialogTitle>
            <DialogDescription>
              سيتم إرسال إشعار في لوحة التحكم <strong>و</strong> رسالة بريد إلكتروني لكل المشاركين
              المسجلين في «{reminderTarget?.name}». لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {reminderLoading ? (
              <p className="text-muted-foreground">جاري حساب عدد المستلمين...</p>
            ) : reminderPreview ? (
              <>
                <div className="rounded-md border bg-muted/40 p-3">
                  سيصل التذكير إلى{' '}
                  <strong className="text-base">{reminderPreview.recipientCount}</strong> مشارك مسجل.
                  {reminderPreview.recipientCount === 0 && (
                    <span className="block mt-1 text-red-600">
                      لا يوجد مشاركون مسجلون — لن يتم إرسال شيء.
                    </span>
                  )}
                </div>
                {reminderPreview.lastReminderAt && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    سبق إرسال تذكير لهذه الفعالية بتاريخ{' '}
                    {new Date(reminderPreview.lastReminderAt).toLocaleString('ar-SA')}. إرسال تذكير
                    آخر سيصل للمشاركين مرة ثانية.
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">تعذر حساب عدد المستلمين — يمكنك المتابعة.</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-center sm:space-x-0">
            <Button
              variant="outline"
              disabled={remindingEventId !== null}
              onClick={() => {
                setReminderTarget(null);
                setReminderPreview(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              disabled={remindingEventId !== null || reminderPreview?.recipientCount === 0}
              onClick={() => confirmSendReminder(false)}
            >
              <Bell className="ml-2 h-4 w-4" />
              {remindingEventId ? 'جاري الإرسال...' : 'تأكيد الإرسال'}
            </Button>
            {reminderPreview?.lastReminderAt && (
              <Button
                variant="destructive"
                disabled={remindingEventId !== null || reminderPreview?.recipientCount === 0}
                onClick={() => confirmSendReminder(true)}
                title="تجاهل مهلة إعادة الإرسال"
              >
                إرسال مرة أخرى على أي حال
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
       
        open={isDeleteConfirmDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setIsDeleteConfirmDialogOpen(false);
            setEventToDelete(null);
            setDeleteError("");
          }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد حذف الفعالية</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من رغبتك في حذف هذه الفعالية؟ هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          
          {deleteError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
              {deleteError}
            </div>
          )}
          
          <DialogFooter className="gap-2 sm:justify-center sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteConfirmDialogOpen(false);
                setEventToDelete(null);
              }}
              disabled={isDeleting}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => eventToDelete && handleDeleteEvent(eventToDelete)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                <>
                  <Trash className="ml-2 h-4 w-4" />
                  تأكيد الحذف
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
