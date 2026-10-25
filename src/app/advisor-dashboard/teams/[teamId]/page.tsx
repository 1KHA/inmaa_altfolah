"use client";

import TeamPracticeReview from "@/components/practice/TeamPracticeReview";

export default function AdvisorTeamPage({ params }: { params: { teamId: string } }) {
  return (
    <TeamPracticeReview
      teamId={params.teamId}
      basePath={`/advisor-dashboard/teams/${params.teamId}`}
      backHref="/advisor-dashboard"
    />
  );
}
