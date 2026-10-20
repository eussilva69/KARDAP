import { Armchair } from "lucide-react";
import { initial } from "@/lib/format";
import type { Brand } from "@/components/dashboard/types";

/**
 * Cabeçalho do cardápio público: capa, logo, nome e a mesa identificada pelo QR.
 * O painel usa o mesmo componente na prévia de Personalização (`preview`).
 */
export function MenuHero({
  name,
  brand,
  table,
  preview = false,
  subtitle,
  children,
}: {
  name: string;
  brand: Brand;
  table?: string;
  preview?: boolean;
  /** Linha abaixo do nome quando não há mesa (o delivery mostra prazo e status de funcionamento). */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const Title = preview ? "p" : "h1";
  return (
    <header className={`kd-menu-hero ${brand.cover ? "has-cover" : ""}`}>
      {brand.cover && (
        <div className="kd-menu-cover">
          {/* Capa nova tem duas versões (960 e 1920 px): o navegador escolhe pela largura da tela. A coluna do cardápio tem até 640 px. */}
          <img
            src={brand.cover}
            srcSet={brand.coverSmall ? `${brand.coverSmall} 960w, ${brand.cover} 1920w` : undefined}
            sizes={brand.coverSmall ? "(max-width: 640px) 100vw, 640px" : undefined}
            alt=""
            width={1200}
            height={675}
            decoding="async"
            fetchPriority={preview ? undefined : "high"}
          />
        </div>
      )}
      <div className="kd-menu-id">
        <span className="kd-menu-logo">
          {brand.logo ? <img src={brand.logoSmall || brand.logo} alt="" width={76} height={76} decoding="async" /> : <span aria-hidden>{initial(name)}</span>}
        </span>
        <div className="kd-menu-id-text">
          <Title className="kd-menu-name">{name || "Cardápio"}</Title>
          {table ? (
            <p className="kd-menu-table">
              <Armchair size={14} aria-hidden />
              <span>
                Você está na <b>{table}</b>
              </span>
            </p>
          ) : (
            <p className="kd-menu-table is-unknown">{subtitle ?? "Cardápio digital"}</p>
          )}
        </div>
      </div>
      {children}
    </header>
  );
}
