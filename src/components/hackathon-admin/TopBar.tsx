"use client"

import { useEffect, useState } from "react"
import Image from "next/image";
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import EventTimeline from "@/components/ui/event-timeline"
import NotificationDropdown from "@/components/ui/notification-dropdown"
import DashboardMobileMenu from "@/components/ui/dashboard-mobile-menu"
import { useAuth } from "@/contexts/auth-context"
// Same list the desktop sidebar renders, so the two cannot diverge.
import { navItems } from "@/components/hackathon-admin/AdminHacktonSidebar"

export default function TopBar() {
  const pathname = usePathname()
  const { logout } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // The panel is not a route, so navigating inside it has to close it.
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 bg-[#80191a] text-primary-foreground text-right" dir="rtl">
      <div className="h-12 flex items-center justify-between px-4">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="rounded-md p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 md:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">القائمة</span>
          </button>
          <Image
              src="/brand/logo01.png"
              alt="جائزة مايدة محي الدين ناظر للابتكار"
              width={549}
              height={406}
              priority
              className="h-9 w-auto shrink-0 sm:h-10"
            />
        </div>
        {/* Hackathon journey timeline */}
        <div className="hidden md:flex flex-1 justify-center px-4 min-w-0">
          <EventTimeline />
        </div>
        <div className="flex flex-1 justify-center px-2 min-w-0 md:hidden">
          <EventTimeline variant="chip" />
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="hidden text-sm sm:block">لوحة تحكم</div>
          <NotificationDropdown
            userType="admin"
            className="text-primary-foreground hover:bg-[#5e1213]"
          />
        </div>
      </div>

      <DashboardMobileMenu
        open={isMobileMenuOpen}
        items={navItems}
        pathname={pathname}
        onNavigate={() => setIsMobileMenuOpen(false)}
        onLogout={logout}
        headerHeightClass="max-h-[calc(100vh-3rem)]"
      />
    </header>
  )
}
