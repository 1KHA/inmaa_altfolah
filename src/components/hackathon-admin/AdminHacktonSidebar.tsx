"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { 
  Home, 
  Calendar, 
  FileText, 
  Users, 
  UserCheck,
  Trophy,
  BookOpen,
  BarChart3,
  Bell,
  Flag,
  Settings,
  ScanLine,
  LogOut, Upload, Layers, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Exported so the TopBar hamburger renders the same list on mobile
// instead of keeping its own copy.
export const navItems = [
  { name: "لوحة التحكم", href: "/admin-hackton-dashboard", icon: Home },
  { name: "الفعاليات", href: "/admin-hackton-dashboard/events", icon: Calendar },
  { name: "المشاركون", href: "/admin-hackton-dashboard/participants", icon: Users },
  { name: "الفرق", href: "/admin-hackton-dashboard/teams", icon: UserCheck },
  { name: "المراحل", href: "/admin-hackton-dashboard/phases", icon: Layers },
  { name: "المرشدون", href: "/admin-hackton-dashboard/mentors", icon: BookOpen },
  { name: "حجوزات الموجهين", href: "/admin-hackton-dashboard/bookings", icon: CalendarClock },
  { name: "التسليمات", href: "/admin-hackton-dashboard/milestones", icon: Flag },
  { name: "تسجيل الحضور", href: "/admin-hackton-dashboard/attendance", icon: ScanLine },
  { name: "الإشعارات", href: "/admin-hackton-dashboard/notifications", icon: Bell },
  { name: "استيراد البيانات", href: "/admin-hackton-dashboard/import", icon: Upload },
  { name: "الإعدادات والرسائل", href: "/admin-hackton-dashboard/settings", icon: Settings },
];

export default function AdminHacktonSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col" dir="rtl">
      <div className="p-4 border-b border-border">
        <h2 className="text-xl font-bold text-primary">إدارة الهاكاثون</h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-md ${
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-secondary hover:text-primary"
            }`}
          >
            <item.icon className="w-5 h-5 me-3" />
            {item.name}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <Button 
          variant="ghost" 
          className="w-full flex items-center justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={logout}
        >
          <LogOut className="w-5 h-5 me-3" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
