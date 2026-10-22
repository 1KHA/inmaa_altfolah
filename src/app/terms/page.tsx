import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicPageShell from "@/components/site/PublicPageShell";
import { TERMS_TITLE, TermsBody } from "../_childhood-landing/components/TermsContent";
import { EVENT } from "../_childhood-landing/content/event";
import { pageMetadata } from "../seo";

// Text lives in src/app/_childhood-landing/content/terms.md
export const metadata = pageMetadata({
  path: "/terms",
  title: TERMS_TITLE,
  description: `الشروط والأحكام الخاصة باستخدام موقع ${EVENT.name} والمشاركة فيه، بما فيها حقوق الملكية الفكرية والاستخدام العادل للأفكار.`,
});

export default function TermsPage() {
  return (
    <PublicPageShell>
      <div className="max-w-4xl mx-auto">
        <Card className="gradient-card rounded-3xl border-border/60 shadow-elegant">
          <CardHeader className="text-center pb-6 pt-10">
            <CardTitle className="text-4xl font-bold text-primary">{TERMS_TITLE}</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-10 sm:px-10">
            <TermsBody />
          </CardContent>
        </Card>
      </div>
    </PublicPageShell>
  );
}
