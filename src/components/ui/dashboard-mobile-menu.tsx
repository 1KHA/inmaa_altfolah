"use client";

/**
 * The mobile hamburger panel shared by the participant, mentor and admin
 * dashboards.
 *
 * All three headers share the dashboard header colour, so the panel simply
 * continues it rather than opening a separate light-coloured drawer. The order
 * is fixed here on purpose — navigation, then تسجيل الخروج, then the timeline —
 * so the three dashboards cannot drift apart again.
 *
 * Render it as the last child of the <header>; it takes care of its own
 * md:hidden and scrolling.
 */

import Link from "next/link";
import { LogOut, type LucideIcon } from "lucide-react";
import EventTimeline from "@/components/ui/event-timeline";
import { cn } from "@/lib/utils";

export interface DashboardMobileMenuItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export default function DashboardMobileMenu({
  open,
  items,
  pathname,
  onNavigate,
  onLogout,
  /** Header height to subtract, so the panel never runs past the viewport. */
  headerHeightClass = "max-h-[calc(100vh-4rem)]",
}: {
  open: boolean;
  items: DashboardMobileMenuItem[];
  pathname: string;
  onNavigate: () => void;
  onLogout: () => void;
  headerHeightClass?: string;
}) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "overflow-y-auto border-t border-primary-foreground/20 md:hidden",
        headerHeightClass
      )}
    >
      <nav className="p-3">
        <p className="mb-2 px-1 text-xs font-semibold text-primary-foreground/70">التنقل</p>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                  pathname === item.href
                    ? "bg-primary-foreground/20 font-semibold"
                    : "hover:bg-primary-foreground/10"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-primary-foreground/10"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span>تسجيل الخروج</span>
            </button>
          </li>
        </ul>
      </nav>
      <div className="border-t border-primary-foreground/20 p-4">
        <p className="mb-2 text-xs font-semibold text-primary-foreground/70">رحلة المشاركة</p>
        <EventTimeline variant="list" />
      </div>
    </div>
  );
}
