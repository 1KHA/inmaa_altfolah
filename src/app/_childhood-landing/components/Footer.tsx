import "../childhood-landing.css";
import { Globe, Instagram, Mail, Phone } from "lucide-react";
import { CONTACT, EVENT, NAV_LINKS } from "../content/event";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const contactItems = [
  { icon: Phone, label: "رقم التواصل", value: CONTACT.phoneDisplay, href: CONTACT.phoneHref },
  { icon: Mail, label: "البريد الرسمي", value: CONTACT.email, href: `mailto:${CONTACT.email}` },
  { icon: Globe, label: "الموقع الإلكتروني", value: CONTACT.websiteDisplay, href: CONTACT.website }
];

const socialLinks = [
  { label: "إنماء على منصة X", href: CONTACT.x, icon: XIcon },
  { label: "إنماء على إنستغرام", href: CONTACT.instagram, icon: Instagram }
];

export function Footer() {
  return (
    <footer className="childhood-landing bg-card/70 border-t border-border/60 px-6 pt-16 pb-8">
      <div className="container mx-auto">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr]">
          {/* Brand */}
          <div className="space-y-5">
            <img src="/brand/logo-horizontal.svg" alt={EVENT.name} className="h-14 w-auto" />
            <p className="text-lg font-bold text-accent arabic-text">من تحدٍ حقيقي... إلى فرصة للابتكار</p>
            <div className="flex items-center gap-3">
              <img src="/partners/inma.webp" alt="" className="h-12 w-auto" loading="lazy" />
              <p className="text-sm text-muted-foreground arabic-text">
                بتنظيم<br />
                <span className="font-semibold text-primary">{EVENT.organizer}</span>
              </p>
            </div>
          </div>

          {/* Quick links */}
          <nav aria-label="روابط سريعة" className="space-y-4">
            <h2 className="text-lg font-bold text-primary">روابط سريعة</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-muted-foreground hover:text-primary transition-smooth">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-primary">تواصل معنا</h2>
            <ul className="space-y-3">
              {contactItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <li key={item.label}>
                    <a href={item.href} className="group flex items-center gap-3" {...(item.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      <span className="blob w-10 h-10 shrink-0 flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-smooth">
                        <IconComponent className="w-5 h-5" aria-hidden />
                      </span>
                      <span className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span dir="ltr" className="self-start font-semibold text-primary">{item.value}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Social */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-primary">تابعنا</h2>
            <p className="font-semibold text-primary"><bdi dir="ltr">{CONTACT.handle}</bdi></p>
            <ul className="flex items-center gap-3">
              {socialLinks.map((social) => {
                const IconComponent = social.icon;
                return (
                  <li key={social.href}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      title={social.label}
                      className="blob w-12 h-12 flex items-center justify-center bg-primary text-primary-foreground hover:bg-accent-hover transition-smooth"
                    >
                      <IconComponent className="w-5 h-5" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>© 2026 {EVENT.name}. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
}
