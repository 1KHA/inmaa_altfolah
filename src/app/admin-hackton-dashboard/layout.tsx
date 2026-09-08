"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/hackathon-admin/AdminHacktonSidebar";
import TopBar from "@/components/hackathon-admin/TopBar";
import AdminRouteGuard from "@/components/auth/AdminRouteGuard";

export default function AdminDashboardLayout({
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
    <AdminRouteGuard>
      <div className="min-h-screen bg-background">
        <TopBar />

        <div className="flex">
          {/* Hidden on mobile — the TopBar hamburger carries the nav there */}
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <main className="flex-1 min-w-0 w-full p-3 sm:p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminRouteGuard>
  );
}
