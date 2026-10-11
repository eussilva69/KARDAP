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
  children,
}: {
  name: string;
  brand: Brand;
  table?: string;
  preview?: boolean;
  children?: React.ReactNode;
}) {
  const Title = preview ? "p" : "h1";
  return (
    <header className={`kd-menu-hero ${brand.cover ? "has-cover" : ""}`}>
      {brand.cover && (
        <div className="kd-menu-cover">
          <img src={brand.cover} alt="" width={1200} height={675} decoding="async" fetchPriority={preview ? undefined : "high"} />
        </div>
      )}
      <div className="kd-menu-id">
        <span className="kd-menu-logo">
          {brand.logo ? <img src={brand.logo} alt="" width={76} height={76} decoding="async" /> : <span aria-hidden>{initial(name)}</span>}
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
            <p className="kd-menu-table is-unknown">Cardápio digital</p>
          )}
        </div>
      </div>
      {children}
    </header>
  );
}
