import { PdvAuthProvider } from "@/components/pdv-auth-provider";
import { requirePdvSession } from "@/lib/sso/pdv-server";

// Sessão conferida a cada requisição: nada desta área vai para cache.
export const dynamic = "force-dynamic";

/**
 * Layout das páginas protegidas do PDV (exemplo: mova as páginas do PDV para dentro de app/(pdv)/).
 * O servidor central valida a sessão e a permissão antes de renderizar; o provider conecta o Firebase do navegador.
 */
export default async function PdvLayout({ children }: { children: React.ReactNode }) {
  await requirePdvSession();
  return <PdvAuthProvider fallback={<p style={{ padding: 24 }}>Conectando ao PDV…</p>}>{children}</PdvAuthProvider>;
}
