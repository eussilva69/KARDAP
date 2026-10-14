/**
 * Chamadas às APIs de planos a partir do navegador. Sem dependências pesadas: o login do Firebase só é carregado
 * quando uma chamada autenticada acontece (a página pública de preços não baixa o Firestore por causa disto).
 */

/** fetch autenticado com o ID token da sessão atual. */
export async function billingFetch(input: string, init: RequestInit = {}) {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
  return fetch(input, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
}

/** Lê a mensagem de erro da API (já escrita para o usuário) sem expor detalhes técnicos. */
export async function apiError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    const message = typeof data?.message === "string" ? data.message : typeof data?.error === "string" && data.error.length > 20 ? data.error : "";
    return Object.assign(new Error(message && message.length < 240 ? message : fallback), { code: data?.code || data?.error });
  } catch {
    return new Error(fallback);
  }
}
