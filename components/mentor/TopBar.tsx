"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Menu,
  X,
  User,
  LogOut,
  Settings,
  HelpCircle,
  Home,
  ListChecks,
  CalendarClock,
  Bell,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EventTimeline from "@/components/ui/event-timeline";
import NotificationDropdown from "@/components/ui/notification-dropdown";
import DashboardMobileMenu from "@/components/ui/dashboard-mobile-menu";
import { useAuth } from "@/contexts/auth-context";

const MOBILE_NAV_ITEMS = [
  { name: "لوحة التحكم", href: "/mentor-dashboard", icon: Home },
  { name: "جلسات الإرشاد", href: "/mentor-dashboard/sessions", icon: ListChecks },
  { name: "إدارة التوفر", href: "/mentor-dashboard/availability", icon: CalendarClock },
  { name: "الإشعارات", href: "/mentor-dashboard/notifications", icon: Bell },
  { name: "الملف الشخصي", href: "/mentor-dashboard/profile", icon: User },
];

export default function TopBar() {
  const { logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);


  const handleLogout = async () => {
    // Must go through the auth context: it calls /api/logout to clear the
    // httpOnly cookie server-side, clears localStorage and resets user state.
    // Previously this just did `window.location.href = "/"`, which left the
    // session cookie intact — so /login saw a valid mentor session and
    // immediately redirected straight back into the mentor dashboard.
    await logout();
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-[#364F7A] text-primary-foreground">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="mr-2 rounded-md p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 md:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
            <span className="sr-only">القائمة</span>
          </button>

          <Link href="/mentor-dashboard" className="flex items-center">
            <span className="text-xl font-bold">منصة دِيَم</span>
            <span className="ml-1 hidden sm:inline rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-medium">
              لوحة المرشد
            </span>
          </Link>
        </div>

        {/* Hackathon journey timeline (replaces the old search bar) */}
        <div className="hidden md:flex md:flex-1 md:justify-center md:px-4 min-w-0">
          <EventTimeline />
        </div>
        <div className="flex flex-1 justify-center px-2 min-w-0 md:hidden">
          <EventTimeline variant="chip" />
        </div>

        <div className="flex items-center gap-2">
          <NotificationDropdown userType="mentor" className="text-primary-foreground hover:bg-primary-foreground/10" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <User className="h-5 w-5" />
                <span className="sr-only">الملف الشخصي</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium">المرشد</p>
                <p className="text-xs text-muted-foreground">
                  mentor@example.com
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="ml-2 h-4 w-4" />
                <span>الملف الشخصي</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="ml-2 h-4 w-4" />
                <span>الإعدادات</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HelpCircle className="ml-2 h-4 w-4" />
                <span>المساعدة</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="ml-2 h-4 w-4" />
                <span>تسجيل الخروج</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile navigation drawer — same pattern as the admin dashboard */}
      <DashboardMobileMenu
        open={isMobileMenuOpen}
        items={MOBILE_NAV_ITEMS}
        pathname={pathname}
        onNavigate={() => setIsMobileMenuOpen(false)}
        onLogout={handleLogout}
      />
    </header>
  );
}
