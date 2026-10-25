"use client";

import PracticeOverview from "@/components/practice/PracticeOverview";

// Advisor home: cards waiting for review and every team's progress
export default function AdvisorDashboardPage() {
  return (
    <PracticeOverview
      showRanking={false}
      teamHref={(teamId, cardKey) => `/advisor-dashboard/teams/${teamId}${cardKey ? `?card=${cardKey}` : ""}`}
    />
  );
}
