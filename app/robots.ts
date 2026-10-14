import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * robots.txt — tudo o que é público pode ser rastreado (inclusive por robôs de IA; política em docs/SEO.md).
 * Áreas logadas e APIs ficam fora. Login, cadastro e cardápios das mesas continuam rastreáveis para que os robôs
 * vejam o "noindex" dessas páginas.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/admin", "/onboarding", "/logout"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
