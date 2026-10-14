import type { MetadataRoute } from "next";
import landingPages from "@/lib/seo/landing-pages.json";
import { INDEXABLE_APP_ROUTES, SITE_URL } from "@/lib/seo/site";

/** sitemap.xml — só endereços canônicos e indexáveis (páginas com "noindex" ficam de fora). */
export default function sitemap(): MetadataRoute.Sitemap {
  const landing = Object.values(landingPages)
    .filter((page) => page.index)
    .map((page) => page.path);
  return [...landing, ...INDEXABLE_APP_ROUTES].map((path) => ({ url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}` }));
}
