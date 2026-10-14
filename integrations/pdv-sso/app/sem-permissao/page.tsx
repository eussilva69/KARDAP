import { KARDAP_ORIGIN, PDV_ORIGIN, RETURN_PARAM } from "@/lib/sso/config";

export const metadata = { title: "Sem acesso ao PDV", robots: { index: false, follow: false } };

const box = { maxWidth: 520, margin: "12vh auto", padding: 24, textAlign: "center" as const, fontFamily: "system-ui, sans-serif", color: "#111111" };
const row = { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const, marginTop: 24 };
const primary = { background: "#F7EA48", color: "#111111", padding: "12px 20px", borderRadius: 999, fontWeight: 700, textDecoration: "none" };
const secondary = { background: "#F5F5F3", color: "#111111", padding: "12px 20px", borderRadius: 999, fontWeight: 600, textDecoration: "none" };

/**
 * Conta sem acesso ao PDV. O motivo vem do servidor central (requirePdvSession):
 * - plano: o restaurante está no Start (o PDV começa no Pro) → convite ao upgrade;
 * - assinatura: o plano inclui o PDV, mas a assinatura venceu ou está pendente → regularizar;
 * - sem motivo: a conta não é dona nem tem a permissão "pdv" em nenhum restaurante.
 */
export default function SemPermissao({ searchParams }: { searchParams?: { motivo?: string } }) {
  const motivo = searchParams?.motivo;
  const switchAccount = new URL("/logout", KARDAP_ORIGIN);
  switchAccount.searchParams.set(RETURN_PARAM, `${KARDAP_ORIGIN}/login?${RETURN_PARAM}=${encodeURIComponent(PDV_ORIGIN + "/")}`);

  if (motivo === "plano") {
    return (
      <main style={box}>
        <h1>Desbloqueie o PDV do KARDAP</h1>
        <p style={{ color: "#666666", lineHeight: 1.5 }}>
          Gerencie pedidos, caixa, estoque, mesas, entregas e relatórios em um único sistema. Disponível a partir do plano Pro.
        </p>
        <p style={row}>
          <a style={secondary} href={`${KARDAP_ORIGIN}/planos`}>
            Conhecer planos
          </a>
          <a style={primary} href={`${KARDAP_ORIGIN}/dashboard/plano#planos`}>
            Fazer upgrade
          </a>
        </p>
      </main>
    );
  }
  if (motivo === "assinatura") {
    return (
      <main style={box}>
        <h1>A assinatura do KARDAP não está ativa</h1>
        <p style={{ color: "#666666", lineHeight: 1.5 }}>O PDV volta assim que a assinatura for regularizada. Seus pedidos, caixa e relatórios continuam guardados.</p>
        <p style={row}>
          <a style={primary} href={`${KARDAP_ORIGIN}/dashboard/plano`}>
            Regularizar assinatura
          </a>
          <a style={secondary} href={`${KARDAP_ORIGIN}/dashboard`}>
            Voltar ao painel KARDAP
          </a>
        </p>
      </main>
    );
  }
  return (
    <main style={box}>
      <h1>Sua conta não tem acesso ao PDV</h1>
      <p>Peça ao dono do restaurante para liberar o PDV para você, ou entre com outra conta.</p>
      <p style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        <a href={switchAccount.toString()}>Entrar com outra conta</a>
        <a href={`${KARDAP_ORIGIN}/dashboard`}>Voltar ao painel KARDAP</a>
      </p>
    </main>
  );
}
