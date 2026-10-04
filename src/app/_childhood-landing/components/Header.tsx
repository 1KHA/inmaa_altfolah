import "../childhood-landing.css";
import Link from "next/link";
import { Button } from "./ui/button";
import { EVENT, NAV_LINKS, REGISTER_URL } from "../content/event";

export function Header() {
  return (
    // inset-x-0 rather than left-0 right-0: globals.css flips .left-0/.right-0 under dir="rtl",
    // which would leave the bar pinned to one side instead of spanning the page.
    // `childhood-landing` brings the landing's tokens along when the header is
    // reused on /login and /register-team.
    <header className="childhood-landing fixed top-0 inset-x-0 z-50 bg-background/85 backdrop-blur-sm border-b border-border/60">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between gap-6">
        {/* Logo/Brand */}
        <a href="/#top" className="flex items-center gap-4 shrink-0">
          <img
            src="/brand/logo-horizontal.svg"
            alt={EVENT.name}
            className="h-12 lg:h-14 w-auto"
          />
        </a>

        {/* Section navigation */}
        <nav aria-label="أقسام الصفحة" className="hidden xl:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-primary/80 hover:text-primary hover:bg-primary/5 transition-smooth"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Registration Button */}
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full border-primary bg-transparent px-5 font-semibold text-primary hover:bg-primary hover:text-primary-foreground">
            <Link href={REGISTER_URL}>سجل الآن</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
