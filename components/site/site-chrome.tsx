"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KardapLogo } from "@/components/brand/logo";

/** Cabeçalho das páginas públicas do app (planos, termos, privacidade). */
export function SiteHeader({ session = false, children }: { session?: boolean; children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="kd-site-header">
      <div className="kd-site-header-inner">
        <a href="/" className="kd-site-logo" aria-label="Kardap, página inicial">
          <KardapLogo width={112} alt="" />
        </a>
        {children}
        <nav className="kd-site-nav" aria-label="Conta">
          <Link href="/planos" aria-current={pathname === "/planos" ? "page" : undefined}>
            Planos
          </Link>
          {session ? (
            <Link href="/dashboard" className="kd-btn kd-btn--primary kd-btn--sm">
              Abrir painel
            </Link>
          ) : (
            <>
              <Link href="/login" className="kd-btn kd-btn--secondary kd-btn--sm">
                Entrar
              </Link>
              <Link href="/criar-conta" className="kd-btn kd-btn--primary kd-btn--sm">
                Criar conta grátis
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/*
 * Rodapé: a mesma estrutura e as mesmas classes do HTML gerado por scripts/site-footer.mjs
 * para a landing estática; o estilo vem de public/kardap-footer.css. Mude os dois juntos.
 * Páginas da landing são HTML estático, por isso usam <a> comum (e não <Link>).
 */
const WHATSAPP = { href: "https://wa.me/5511932138691" };

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Produto",
    links: [
      ["Cardápio em vídeo", "/cardapio-video"],
      ["QR Code para mesas", "/qr-code-mesas"],
      ["Cardápio inteligente", "/cardapio-inteligente"],
      ["Gestão do cardápio", "/gestao-cardapio"],
      ["Sua marca no cardápio", "/sua-marca"],
      ["Planos e preços", "/planos"],
    ],
  },
  {
    title: "Conteúdo",
    links: [
      ["Blog", "/blog"],
      ["Dicas para restaurantes", "/dicas-restaurantes"],
      ["Materiais", "/materiais"],
      ["Novidades", "/novidades"],
    ],
  },
  {
    title: "Kardap",
    links: [
      ["Sobre a Kardap", "/sobre"],
      ["Para restaurantes", "/para-restaurantes"],
      ["Parceiros", "/parceiros"],
    ],
  },
  {
    title: "Atendimento",
    links: [
      ["Central de ajuda", "/central-ajuda"],
      ["(11) 93213-8691", "tel:+5511932138691"],
      ["Entrar no painel", "/login"],
    ],
  },
];

const LEGAL: [string, string][] = [
  ["Privacidade", "/privacidade"],
  ["Termos de Uso", "/termos"],
  ["Cookies", "/cookies"],
];

/** Rotas do próprio app: navegação sem recarregar a página. */
const APP_ROUTES = new Set(["/planos", "/login", "/criar-conta", "/privacidade", "/termos", "/cookies"]);

function FooterLink({ label, href, current }: { label: string; href: string; current: boolean }) {
  const aria = current ? ("page" as const) : undefined;
  return APP_ROUTES.has(href) ? (
    <Link href={href} aria-current={aria}>
      {label}
    </Link>
  ) : (
    <a href={href} aria-current={aria}>
      {label}
    </a>
  );
}

/** `cta`: mostra a chamada para criar conta (páginas de venda, como /planos). */
export function SiteFooter({ cta = false }: { cta?: boolean }) {
  const pathname = usePathname();
  return (
    <footer className="kf">
      <div className="kf-wrap">
        {cta && (
          <section className="kf-cta" aria-labelledby="kf-cta-title">
            <div className="kf-cta-copy">
              <p className="kf-cta-kicker">15 dias grátis do plano Pro</p>
              <h2 className="kf-cta-title" id="kf-cta-title">
                Seu cardápio na mesa ainda hoje
              </h2>
              <p className="kf-cta-text">Cadastre os pratos com fotos e vídeos, imprima um QR Code por mesa e receba os chamados do salão em tempo real.</p>
              <div className="kf-cta-actions">
                <Link className="kf-btn kf-btn--primary" href="/criar-conta">
                  Criar conta grátis
                </Link>
                {pathname !== "/planos" && (
                  <Link className="kf-btn kf-btn--ghost" href="/planos">
                    Ver planos e preços
                  </Link>
                )}
              </div>
              <p className="kf-cta-note">Sem cartão de crédito e sem fidelidade.</p>
            </div>
            <img
              className="kf-cta-media"
              src="/imagens/display-cardapio-kardap.webp"
              width={720}
              height={658}
              loading="lazy"
              decoding="async"
              alt="Display de mesa da Kardap com QR Code para abrir o cardápio digital"
            />
          </section>
        )}

        <div className="kf-main">
          <div className="kf-brand">
            <a className="kf-logo" href="/" aria-label="Kardap, página inicial">
              <img src="/brand/kardap-logo.png" width={140} height={50} alt="" />
            </a>
            <p>Cardápio digital com vídeo, QR Code por mesa e chamados de garçom em tempo real.</p>
            <a className="kf-contact" href={WHATSAPP.href} target="_blank" rel="noopener">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              </svg>
              <span>Falar no WhatsApp</span>
            </a>
          </div>
          {COLUMNS.map((col, i) => (
            <nav key={col.title} className="kf-col" aria-labelledby={`kf-col-${i}`}>
              <h2 className="kf-col-title" id={`kf-col-${i}`}>
                {col.title}
              </h2>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <FooterLink label={label} href={href} current={pathname === href} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="kf-bottom">
          <p>© {new Date().getFullYear()} Kardap</p>
          <ul className="kf-legal" aria-label="Documentos legais">
            {LEGAL.map(([label, href]) => (
              <li key={href}>
                <FooterLink label={label} href={href} current={pathname === href} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
