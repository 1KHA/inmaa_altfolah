import { EVENT } from "../_childhood-landing/content/event";
import { pageMetadata } from "../seo";

// The page itself is a client component, so its title and share card live here.
export const metadata = pageMetadata({
  path: "/login",
  title: "تسجيل الدخول",
  description: `الدخول إلى لوحة المشارك أو المرشد في ${EVENT.name}.`,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
