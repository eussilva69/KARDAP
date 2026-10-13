import { KARDAP_ORIGIN, PDV_ORIGIN, RETURN_PARAM } from "@/lib/sso/config";

export const metadata = { title: "Sem acesso ao PDV", robots: { index: false, follow: false } };

/** Conta válida, mas sem permissão de PDV (não é dono nem membro com a permissão "pdv"). */
export default function SemPermissao() {
  const switchAccount = new URL("/logout", KARDAP_ORIGIN);
  switchAccount.searchParams.set(RETURN_PARAM, `${KARDAP_ORIGIN}/login?${RETURN_PARAM}=${encodeURIComponent(PDV_ORIGIN + "/")}`);
  return (
    <main style={{ maxWidth: 480, margin: "15vh auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1>Sua conta não tem acesso ao PDV</h1>
      <p>Peça ao dono do restaurante para liberar o PDV para você, ou entre com outra conta.</p>
      <p style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        <a href={switchAccount.toString()}>Entrar com outra conta</a>
        <a href={`${KARDAP_ORIGIN}/dashboard`}>Voltar ao painel KARDAP</a>
      </p>
    </main>
  );
}
