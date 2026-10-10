export class TimeoutError extends Error {
  code = "timeout";
  /** true quando a gravação ficou na fila local do Firestore e ainda será enviada. */
  constructor(public queued = false) {
    super("timeout");
  }
}

/** O SDK do Firestore não rejeita gravações offline: elas ficam pendentes até a conexão voltar. */
export function withTimeout<T>(promise: Promise<T>, ms = 15000, queued = false): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(queued)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export const withWriteTimeout = <T,>(promise: Promise<T>, ms = 15000) => withTimeout(promise, ms, true);

const MESSAGES: Record<string, string> = {
  timeout: "O servidor não respondeu a tempo. Verifique sua internet e tente de novo.",
  unavailable: "Sem conexão com o servidor. Verifique sua internet e tente de novo.",
  "deadline-exceeded": "O servidor demorou demais para responder. Tente de novo.",
  "permission-denied": "Sua conta não tem permissão para esta ação.",
  "auth/network-request-failed": "Sem conexão com a internet. Verifique sua rede e tente de novo.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "Não encontramos uma conta com este e-mail.",
  "auth/invalid-email": "Este e-mail não parece válido.",
  "auth/email-already-in-use": "Já existe uma conta com este e-mail. Tente entrar.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
  "auth/popup-closed-by-user": "Login com Google cancelado.",
  "auth/popup-blocked": "O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.",
  "auth/operation-not-allowed": "Este método de login não está ativado.",
  "storage/retry-limit-exceeded": "O envio parou por falta de conexão. Tente de novo.",
  "storage/canceled": "Envio cancelado.",
  "storage/unauthorized": "Sua conta não tem permissão para enviar arquivos.",
  "storage/quota-exceeded": "O espaço de armazenamento acabou. Fale com o suporte Kardap.",
};

/** Traduz erros do Firebase/rede para uma frase acionável, sem expor detalhes internos. */
export function friendlyError(error: unknown, fallback = "Não foi possível concluir. Tente de novo.") {
  const code = (error as { code?: string } | null)?.code || "";
  const key = code.replace(/^firestore\//, "");
  if (MESSAGES[key]) return MESSAGES[key];
  if (typeof navigator !== "undefined" && navigator.onLine === false) return MESSAGES.unavailable;
  const message = (error as { message?: string } | null)?.message || "";
  // Mensagens lançadas pelo próprio app já são escritas para o usuário (sem códigos técnicos).
  if (message && !code && !/firebase|firestore|\(|internal|failed to|network/i.test(message)) return message;
  return fallback;
}

export const isTimeout = (error: unknown) => (error as { code?: string } | null)?.code === "timeout";
export const isQueued = (error: unknown) => isTimeout(error) && Boolean((error as TimeoutError).queued);
