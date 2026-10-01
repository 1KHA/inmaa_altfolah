"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  Users,
  Calendar,
  Target,
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
import { useAuth } from "@/contexts/auth-context";
import { useParticipantNav } from "./participant-nav";
import DashboardMobileMenu from "@/components/ui/dashboard-mobile-menu";

export default function TopBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const pathname = usePathname();
  // Same source as the desktop sidebar, so the drawer shows exactly the pages
  // this participant actually has (team vs no-team, leader-only invitations).
  const { items: navItems } = useParticipantNav();

  // The drawer is not a route, so navigating inside it has to close it.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);


  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-[#80191a] text-primary-foreground">
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

          <Link href="/participant-dashboard" className="flex items-center">
            <Image
              src="/brand/logo01.png"
              alt="جائزة مايدة محي الدين ناظر للابتكار"
              width={549}
              height={406}
              priority
              className="h-9 w-auto shrink-0 sm:h-10"
            />
            <span className="ml-1 hidden sm:inline rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-medium">
              لوحة المشارك
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
          <NotificationDropdown userType="participant" className="text-primary-foreground hover:bg-primary-foreground/10" />

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
                <p className="text-sm font-medium">{user?.fullName || user?.name || 'المشارك'}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.email || 'participant@example.com'}
                </p>
                {user?.teamName && (
                  <p className="text-xs text-muted-foreground">
                    فريق: {user.teamName}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard">
                  <User className="ml-2 h-4 w-4" />
                  <span>الملف الشخصي</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard/teams">
                  <Users className="ml-2 h-4 w-4" />
                  <span>فريقي</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard/events">
                  <Calendar className="ml-2 h-4 w-4" />
                  <span>الفعاليات</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard/milestones">
                  <Target className="ml-2 h-4 w-4" />
                  <span>المراحل</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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

      <DashboardMobileMenu
        open={isMobileMenuOpen}
        items={navItems}
        pathname={pathname}
        onNavigate={() => setIsMobileMenuOpen(false)}
        onLogout={handleLogout}
      />
    </header>
  );
}
