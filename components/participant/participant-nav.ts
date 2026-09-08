"use client"

/**
 * The participant navigation, in one place.
 *
 * The desktop sidebar and the mobile hamburger drawer both read from here.
 * They used to be two hand-maintained lists, and they had already drifted: the
 * old bottom bar showed «فريقي» and «الفرق» at the same time (they are mutually
 * exclusive) and omitted «الدعوات المستلمة» entirely.
 */

import { useEffect, useMemo, useState } from "react"
import { Home, Users, Flag, Star, Book, Calendar, QrCode, type LucideIcon } from "lucide-react"
import { usePermissions } from "@/hooks/usePermissions"

export interface ParticipantNavItem {
  name: string
  href: string
  icon: LucideIcon
  permission: { category: string; action: string }
  /** Conditional display: some entries only make sense with/without a team. */
  showWhen?: "hasTeam" | "noTeam" | "isLeader"
}

export const participantNavItems: ParticipantNavItem[] = [
  { name: "لوحة التحكم", href: "/participant-dashboard", icon: Home, permission: { category: "dashboard", action: "view" } },
  { name: "فريقي", href: "/participant-dashboard/team", icon: Flag, permission: { category: "users", action: "view" }, showWhen: "hasTeam" },
  { name: "الفرق", href: "/participant-dashboard/teams", icon: Users, permission: { category: "users", action: "view" }, showWhen: "noTeam" },
  { name: "الدعوات المستلمة", href: "/participant-dashboard/join-requests", icon: Users, permission: { category: "users", action: "view" }, showWhen: "isLeader" },
  { name: "التسليمات", href: "/participant-dashboard/milestones", icon: Star, permission: { category: "startups", action: "view" } },
  { name: "الموجهون", href: "/participant-dashboard/mentors", icon: Book, permission: { category: "mentorship", action: "view" } },
  { name: "الفعاليات", href: "/participant-dashboard/events", icon: Calendar, permission: { category: "events", action: "view" } },
  { name: "بطاقتي", href: "/participant-dashboard/badge", icon: QrCode, permission: { category: "events", action: "view" } },
]

interface ParticipantNavData {
  teamId: string | null
  isLeader: boolean
}

/**
 * One in-flight request shared by every consumer: the sidebar stays mounted
 * (just hidden) on mobile, so without this the drawer would refetch /me on
 * every page load alongside it.
 */
let cached: Promise<ParticipantNavData | null> | null = null
function loadParticipant(): Promise<ParticipantNavData | null> {
  if (!cached) {
    cached = fetch("/api/participant/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data ? { teamId: data.teamId ?? null, isLeader: Boolean(data.isLeader) } : null))
      .catch(() => null)
  }
  return cached
}

/** Nav entries the signed-in participant may actually see. */
export function useParticipantNav() {
  const { hasPermission, loading } = usePermissions()
  const [participant, setParticipant] = useState<ParticipantNavData | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadParticipant().then((data) => {
      if (!active) return
      setParticipant(data)
      setDataLoading(false)
    })
    return () => { active = false }
  }, [])

  const items = useMemo(() => {
    if (loading || dataLoading) return []
    return participantNavItems.filter((item) => {
      if (item.permission && !hasPermission(item.permission)) return false
      if (item.showWhen && participant) {
        switch (item.showWhen) {
          case "hasTeam": return participant.teamId !== null
          case "noTeam": return participant.teamId === null
          case "isLeader": return participant.isLeader && participant.teamId !== null
          default: return true
        }
      }
      return true
    })
  }, [hasPermission, loading, participant, dataLoading])

  return { items, loading: loading || dataLoading }
}
