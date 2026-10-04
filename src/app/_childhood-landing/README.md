# هاكثون الطفولة: Landing Page

The site's home page. `src/app/page.tsx` renders `<ChildhoodLanding />` at `/` and carries the
page metadata and Event structured data. The folder name starts with `_`, so Next.js gives it
no route of its own.

Ported from a standalone Vite app (React 18, Tailwind CSS 3). What changed in the port:

- Components that use hooks are client components (`"use client"`); the rest render on the server.
- The countdown fills in after mount, because the page is prerendered at build time.
- The «سجل الآن» buttons link to `REGISTER_URL` (`/register-team`).
- The identity's colour tokens are scoped to the `.childhood-landing` wrapper instead of `:root`,
  so the dashboards keep their own palette.

## Where things live

| What | File |
|---|---|
| Name, venue, dates, contact details, social links, navigation, registration link | `content/event.ts` |
| Registration countdown deadline | `REGISTRATION_DEADLINE` in `content/event.ts` |
| Colour tokens and fonts | `childhood-landing.css` |
| Identity classes (`.blob`, `.brand-pill`, `.brand-rule`, scroll animations) | the Childhood block at the end of `src/app/globals.css` |
| `brand-*` colours, `accent-hover`, `bg-gradient-hero` | `tailwind.config.js` |
| Partner logos and tiers | `components/PartnersSection.tsx` |
| Each section's text | the matching file in `components/` |
| Logos, favicon, share image | `public/brand/` |
| Partner logos (WebP) | `public/partners/` |

`components/ui/button.tsx` is the landing's own copy of the shadcn button: it adds the `hero`
variant and `xl` size. The shared `@/components/ui/button` is left alone so dashboard buttons
don't change. Cards use the shared `@/components/ui/card`, which is identical.

## Notes

- **Font licence**: Graphik Arabic (`assets/fonts/`) is a commercial typeface. Make sure there is
  a web licence before publishing.
- **Hidden sections**: منهجية العمل, برنامج الهاكاثون, معايير التحكيم and ما بعد الفوز were hidden in
  the original project and are not included.
