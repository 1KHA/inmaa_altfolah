import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/register-team", "/login"],
      disallow: [
        "/admin-login",
        "/admin-hackton-dashboard/",
        "/api/",
        "/participant-dashboard/",
        "/mentor-dashboard/",
      ],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
