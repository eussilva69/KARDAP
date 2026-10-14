import { readFileSync } from 'node:fs';

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

// Páginas estáticas da landing (gerado por scripts/seo-landing.mjs; ver docs/SEO.md).
const landingSlugs = Object.keys(JSON.parse(readFileSync(new URL('./lib/seo/landing-pages.json', import.meta.url), 'utf8'))).filter((s) => s !== 'index');

const nextConfig = {
  // Lista de origens do SSO (não é segredo): a tela de login também valida o destino de retorno no navegador.
  env: { SSO_ALLOWED_ORIGINS: process.env.SSO_ALLOWED_ORIGINS || '' },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Arquivos da pasta mirror têm o hash do conteúdo no nome: podem ficar em cache por um ano.
      { source: '/mirror/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  // Um endereço por página: as variantes antigas redirecionam (301) para o endereço canônico.
  async redirects() {
    return [
      { source: '/index', destination: '/', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
      { source: `/:slug(${landingSlugs.join('|')}).html`, destination: '/:slug', permanent: true },
      // Página que reproduzia o site de outra empresa (retirada do ar; ver docs/SEO.md).
      { source: '/snapshot', destination: '/', permanent: true },
      { source: '/snapshot.html', destination: '/', permanent: true },
    ];
  },
};
export default nextConfig;
