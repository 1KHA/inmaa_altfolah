import { Bell, ClipboardList, type LucideIcon } from "lucide-react";

/** Advisor dashboard navigation, shared by the sidebar and the mobile drawer. */
export const advisorNavItems: { name: string; href: string; icon: LucideIcon }[] = [
  { name: "مراجعة النماذج", href: "/advisor-dashboard", icon: ClipboardList },
  { name: "الإشعارات", href: "/advisor-dashboard/notifications", icon: Bell },
];

/** Team pages belong to «مراجعة النماذج». */
export function isAdvisorNavActive(href: string, pathname: string): boolean {
  if (href === "/advisor-dashboard") return pathname === href || pathname.startsWith("/advisor-dashboard/teams");
  return pathname === href;
}
