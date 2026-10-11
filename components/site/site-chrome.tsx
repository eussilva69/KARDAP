import Link from "next/link";
import { KardapLogo } from "@/components/brand/logo";

/** Cabeçalho das páginas públicas do app (planos, termos, privacidade). */
export function SiteHeader({ session = false, children }: { session?: boolean; children?: React.ReactNode }) {
  return (
    <header className="kd-site-header">
      <div className="kd-site-header-inner">
        <a href="/" className="kd-site-logo" aria-label="Kardap, página inicial">
          <KardapLogo width={112} alt="" />
        </a>
        {children}
        <nav className="kd-site-nav" aria-label="Conta">
          <Link href="/planos">Planos</Link>
          {session ? (
            <Link href="/dashboard" className="kd-btn kd-btn--secondary kd-btn--sm">
              Abrir painel
            </Link>
          ) : (
            <Link href="/login" className="kd-btn kd-btn--secondary kd-btn--sm">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="kd-site-footer">
      <div className="kd-site-footer-inner">
        <div className="kd-site-footer-brand">
          <KardapLogo width={104} alt="Kardap" />
          <p>Cardápio digital com QR Code por mesa e chamados em tempo real.</p>
        </div>
        <nav aria-label="Rodapé">
          <ul>
            <li>
              <Link href="/planos">Planos</Link>
            </li>
            <li>
              <Link href="/criar-conta">Criar conta</Link>
            </li>
            <li>
              <Link href="/login">Entrar</Link>
            </li>
            <li>
              <Link href="/privacidade">Privacidade</Link>
            </li>
            <li>
              <Link href="/termos">Termos de Uso</Link>
            </li>
            <li>
              <Link href="/cookies">Cookies</Link>
            </li>
          </ul>
        </nav>
        <p className="kd-site-footer-copy">© {new Date().getFullYear()} Kardap</p>
      </div>
    </footer>
  );
}
