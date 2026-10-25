"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/advisor/Sidebar";
import TopBar from "@/components/advisor/TopBar";
import AdvisorRouteGuard from "@/components/auth/AdvisorRouteGuard";
import { SidebarProvider, useSidebar } from "@/contexts/sidebar-context";

// Same shell as the mentor dashboard. Content column whose margin tracks the (fixed) sidebar's width.
function MainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  return (
    <main
      className={`flex-1 min-w-0 w-full p-3 sm:p-4 md:p-6 transition-all duration-300 ease-in-out ${
        isCollapsed ? "md:mr-16" : "md:mr-64"
      }`}
    >
      {children}
    </main>
  );
}

export default function AdvisorDashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <AdvisorRouteGuard>
      <SidebarProvider>
        <div className="min-h-screen bg-background">
          <TopBar />
          <div className="flex">
            {/* Fixed-positioned; hidden on mobile — the TopBar hamburger carries the nav there */}
            <div className="hidden md:block">
              <Sidebar />
            </div>
            <MainContent>{children}</MainContent>
          </div>
        </div>
      </SidebarProvider>
    </AdvisorRouteGuard>
  );
}
