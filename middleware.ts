import { NextResponse, type NextRequest } from 'next/server';
import landingPages from '@/lib/seo/landing-pages.json';

// Páginas estáticas da landing (public/<slug>.html), servidas em /<slug>. A lista vem de lib/seo/landing-pages.json,
// gerado por scripts/seo-landing.mjs (o mesmo que alimenta o sitemap). A página inicial é "/";
// /index, /index.html e /<slug>.html redirecionam (301) para o endereço canônico (next.config.mjs).
const LP_PAGES = new Set(Object.keys(landingPages).filter((slug) => slug !== 'index'));

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/index.html';
    return NextResponse.rewrite(url);
  }

  const slug = pathname.replace(/^\/+|\/+$/g, '');
  if (slug && !slug.includes('/') && !slug.includes('.') && LP_PAGES.has(slug)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${slug}.html`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
