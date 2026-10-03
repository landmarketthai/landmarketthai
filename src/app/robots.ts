import { SITE_URL } from "@/lib/constants/site";
import type { MetadataRoute } from "next";

const SITE = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/admin/", "/profile"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
