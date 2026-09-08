"use client";

import { useState, useEffect } from "react";
import Sidebar from "../../../components/participant/Sidebar";
import TopBar from "../../../components/participant/TopBar";
import ParticipantRouteGuard from "@/components/auth/ParticipantRouteGuard";
import { SidebarProvider, useSidebar } from "@/contexts/sidebar-context";

// Main content wrapper that responds to sidebar state
function MainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  
  return (
    <main 
      className={`flex-1 min-w-0 w-full p-2 sm:p-4 md:p-6 transition-all duration-300 ease-in-out ${
        isCollapsed ? "md:mr-16" : "md:mr-64"
      } pb-6`}
    >
      {children}
    </main>
  );
}

export default function ParticipantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <ParticipantRouteGuard>
      <SidebarProvider>
        <div className="min-h-screen bg-background overflow-x-hidden">
          <TopBar />
          <div className="flex">
            {/* Hidden on mobile — the TopBar hamburger carries the same nav there */}
            <div className="hidden md:block">
              <Sidebar />
            </div>
            <MainContent>
              {children}
            </MainContent>
          </div>
        </div>
      </SidebarProvider>
    </ParticipantRouteGuard>
  );
}
