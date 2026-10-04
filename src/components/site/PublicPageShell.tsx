import { Header } from "@/app/_childhood-landing/components/Header";
import { Footer } from "@/app/_childhood-landing/components/Footer";

/**
 * Frame for the public pages outside the home page (login, team registration):
 * the landing page's header and footer on the identity's cream background,
 * with the hero's organic shapes behind the content. The header is fixed, so
 * the content starts below it.
 */
export default function PublicPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-hero">
      <Header />
      <main className="relative flex-1 overflow-hidden px-4 pt-28 pb-16 sm:px-6 lg:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="blob absolute -top-24 -left-24 w-80 h-80 bg-brand-honey/20"></div>
          <div className="blob-alt absolute bottom-10 -right-24 w-72 h-72 bg-brand-green/15"></div>
        </div>
        <div className="relative">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
