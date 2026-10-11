import type { Metadata } from "next";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false, follow: false } };

/** Página para endereços que não existem (sem indexação). */
export default function NotFound() {
  return (
    <main className="kd-state">
      <h1 className="kd-state-title">Página não encontrada</h1>
      <p className="kd-state-text">O endereço pode ter mudado ou foi digitado com algum erro.</p>
      <div className="kd-row" style={{ justifyContent: "center" }}>
        <a className="kd-btn kd-btn--primary" href="/">
          Ir para o site
        </a>
        <a className="kd-btn kd-btn--secondary" href="/dashboard">
          Abrir o painel
        </a>
      </div>
    </main>
  );
}
