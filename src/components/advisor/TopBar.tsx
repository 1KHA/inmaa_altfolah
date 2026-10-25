"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { advisorNavItems } from "./nav";

// Same header as the mentor dashboard (components/mentor/TopBar.tsx)
export default function TopBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Through the auth context: it clears the httpOnly cookie server-side too
  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-primary text-primary-foreground">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="mr-2 rounded-md p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 md:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">القائمة</span>
          </button>

          <Link href="/advisor-dashboard" className="flex items-center">
            <Image
              src="/brand/logo-horizontal-light.svg"
              alt="هاكثون الطفولة"
              width={1459}
              height={611}
              priority
              unoptimized
              className="h-9 w-auto shrink-0 md:h-10"
            />
            <span className="ml-1 hidden sm:inline rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-medium">
              لوحة المستشار
            </span>
          </Link>
        </div>

        {/* Hackathon journey timeline */}
        <div className="hidden md:flex md:flex-1 md:justify-center md:px-4 min-w-0">
          <EventTimeline />
        </div>
        <div className="flex flex-1 justify-center px-2 min-w-0 md:hidden">
          <EventTimeline variant="chip" />
        </div>

        <div className="flex items-center gap-2">
          <NotificationDropdown userType="advisor" className="text-primary-foreground hover:bg-primary-foreground/10" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <User className="h-5 w-5" />
                <span className="sr-only">الحساب</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium">{user?.name || "المستشار"}</p>
                {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="ml-2 h-4 w-4" />
                <span>تسجيل الخروج</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile navigation drawer — same pattern as the other dashboards */}
      <DashboardMobileMenu
        open={isMobileMenuOpen}
        items={advisorNavItems}
        pathname={pathname}
        onNavigate={() => setIsMobileMenuOpen(false)}
        onLogout={handleLogout}
      />
    </header>
  );
}
