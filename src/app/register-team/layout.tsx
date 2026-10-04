import { EVENT } from "../_childhood-landing/content/event";
import { pageMetadata } from "../seo";

// The page itself is a client component, so its title and share card live here.
export const metadata = pageMetadata({
  path: "/register-team",
  title: "التسجيل",
  description: `سجّل في ${EVENT.name} فرديًا أو مع فريقك من 4–5 مشاركين، وصمّم حلولًا تقنية تخدم الطفل والأسرة، ${EVENT.dateRange} في ${EVENT.region}.`,
});

export default function RegisterTeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
