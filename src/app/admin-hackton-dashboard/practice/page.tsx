"use client";

import PracticeOverview from "@/components/practice/PracticeOverview";

// Practice cards: review queue and the teams ranked by their total score
export default function AdminPracticePage() {
  return (
    <PracticeOverview
      showRanking
      teamHref={(teamId, cardKey) => `/admin-hackton-dashboard/practice/${teamId}${cardKey ? `?card=${cardKey}` : ""}`}
    />
  );
}
