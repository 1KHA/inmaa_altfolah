"use client";

import TeamPracticeReview from "@/components/practice/TeamPracticeReview";

export default function AdminTeamPracticePage({ params }: { params: { teamId: string } }) {
  return (
    <TeamPracticeReview
      teamId={params.teamId}
      basePath={`/admin-hackton-dashboard/practice/${params.teamId}`}
      backHref="/admin-hackton-dashboard/practice"
    />
  );
}
