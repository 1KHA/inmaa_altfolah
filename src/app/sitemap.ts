import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const lastModified = new Date();
  return [
    { url: `${site}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/register-team`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site}/login`, lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
