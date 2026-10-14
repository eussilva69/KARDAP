/**
 * SEO do app Next (docs/SEO.md). As páginas estáticas da landing são tratadas por scripts/seo-landing.mjs.
 */

/** Endereço canônico do site (NEXT_PUBLIC_SITE_URL em outros ambientes). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kardapp.online").replace(/\/+$/, "");

export const SITE_NAME = "Kardap";

/** Imagem de compartilhamento (1200×630), a mesma das páginas da landing. */
export const OG_IMAGE = { url: "/brand/kardap-og.jpg", width: 1200, height: 630, alt: "Kardap: cardápio digital com vídeo e QR Code por mesa" };

/** Rotas públicas do app que entram no sitemap (as da landing vêm de lib/seo/landing-pages.json). */
export const INDEXABLE_APP_ROUTES = ["/planos", "/privacidade", "/termos", "/cookies"];
