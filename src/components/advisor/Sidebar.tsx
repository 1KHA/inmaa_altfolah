"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/sidebar-context";
import { advisorNavItems, isAdvisorNavActive } from "./nav";

// Same look as the mentor sidebar (components/mentor/Sidebar.tsx)
export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const pathname = usePathname();

  return (
    <motion.aside
      className={cn(
        // The header is h-16 (64px): start right below it
        "fixed top-16 left-0 z-10 bg-card text-card-foreground border-r h-[calc(100vh-4rem)]",
        isCollapsed ? "w-16" : "w-64",
      )}
      animate={{ width: isCollapsed ? 64 : 256 }}
    >
      <div className="flex flex-col h-full text-left">
        <div className="flex items-center justify-between p-4 border-b">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={isCollapsed ? "توسيع القائمة" : "طي القائمة"}>
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="py-2">
            {advisorNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center p-2 mx-2 rounded-lg",
                    isAdvisorNavActive(item.href, pathname)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className={cn("ml-2", { "sr-only": isCollapsed })}>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </motion.aside>
  );
}
