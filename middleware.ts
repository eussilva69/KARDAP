import { NextResponse, type NextRequest } from 'next/server';

const LP_PAGES = new Set([
  'index',
  'cardapio-video',
  'ai-menu',
  'qr-code-mesas',
  'ai-reconciliation',
  'ai-tips',
  'produtos-destaque',
  'experiencia-visual',
  'cardapio-inteligente',
  'sua-marca',
  'gestao-cardapio',
  'experiencia-cliente',
  'para-restaurantes',
  'blog',
  'experiencias',
  'materiais',
  'dicas-restaurantes',
  'empresa',
  'sobre',
  'parceiros',
  'novidades',
  'central-ajuda',
  'snapshot',
]);

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
