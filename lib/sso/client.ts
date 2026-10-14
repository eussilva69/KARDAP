/**
 * SSO no navegador do KARDAP: cria a sessão compartilhada depois do login, encerra no logout e
 * percebe, em qualquer aba, quando ela termina em outro lugar (PDV, outra aba, expiração).
 * Nenhum token fica no localStorage: o cookie da sessão é HttpOnly e o ID token só vai no corpo do POST.
 */
import type { User } from "firebase/auth";
import { CSRF_COOKIE, CSRF_HEADER, readSsoState } from "./config";

/** Marca sem segredo: este navegador tem sessão compartilhada para este uid (só o identificador da conta). */
const LINK_KEY = "kardap-sso-uid";

/** Dados da conta guardados no navegador; saem em qualquer logout. */
export const ACCOUNT_STORAGE_KEYS = [
  "kardap-session",
  "kardap-restaurant-id",
  "kardap-restaurant-owner",
  "kardap-restaurant-slug",
  "kardap-brand",
  "kardap-settings",
  "kardap-calls",
  "kardap-tables",
  LINK_KEY,
];

export const clearAccountStorage = () => ACCOUNT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
export const linkedUid = () => (typeof localStorage === "undefined" ? "" : localStorage.getItem(LINK_KEY) || "");

function readCookie(name: string) {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function csrfToken() {
  const current = readCookie(CSRF_COOKIE);
  if (current) return current;
  await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  return readCookie(CSRF_COOKIE);
}

async function post(url: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", [CSRF_HEADER]: await csrfToken() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    return { res, data: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

export type SsoResult = { ok: true; pdv: boolean } | { ok: false; code: string; message?: string };

/**
 * Cria a sessão compartilhada logo depois de um login. O servidor só aceita ID tokens de login feito
 * há no máximo 5 minutos. Falhar aqui não impede o uso do KARDAP; apenas o PDV pedirá login.
 */
export async function establishSsoSession(user: User, remember = true): Promise<SsoResult> {
  // A marca só volta depois que o servidor confirmar: sem sessão compartilhada, nada de logout automático.
  localStorage.removeItem(LINK_KEY);
  try {
    const { res, data } = await post("/api/auth/session", { idToken: await user.getIdToken(), remember });
    if (!res.ok) return { ok: false, code: data.error || "server_error", message: data.message };
    localStorage.setItem(LINK_KEY, user.uid);
    return { ok: true, pdv: Boolean(data.apps?.pdv) };
  } catch {
    return { ok: false, code: "network" };
  }
}

/** authenticated: null quando não deu para consultar (sem rede, servidor fora): nunca tratar como logout. */
export type SsoStatus = { authenticated: boolean | null; uid?: string; pdv?: boolean };

export async function readSsoSession(): Promise<SsoStatus> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { authenticated: true, uid: data.uid, pdv: Boolean(data.apps?.pdv) };
    return { authenticated: res.status === 401 ? false : null };
  } catch {
    return { authenticated: null };
  }
}

// Logout feito por esta aba: o vigia do cookie de estado não precisa reagir a ele.
let endingHere = false;

/** Encerra a sessão no servidor e apaga os cookies. `everywhere`: revoga o acesso em todos os aparelhos. */
export async function endSsoSession(everywhere = false) {
  localStorage.removeItem(LINK_KEY);
  endingHere = true;
  try {
    const { res } = await post("/api/auth/logout", { scope: everywhere ? "all" : "current" });
    return res.ok;
  } catch {
    return false;
  } finally {
    // Se a saída falhar e a pessoa continuar na tela, o vigia volta a valer.
    window.setTimeout(() => (endingHere = false), 5000);
  }
}

/**
 * Observa o cookie de estado (o mesmo para kardapp.online e pdv.kardapp.online). Chama `onEnded` quando a
 * sessão some (logout em outro aplicativo ou aba, expiração) e `onReplaced` quando outro login a substitui.
 */
export function watchSsoState(handlers: { onEnded: () => void; onReplaced?: () => void }) {
  let last = readSsoState();
  const check = () => {
    const now = readSsoState();
    if (now === last) return;
    const previous = last;
    last = now;
    if (previous && !now) {
      if (!endingHere) handlers.onEnded();
    }
    else if (previous && now) handlers.onReplaced?.();
  };
  const timer = window.setInterval(check, 1500);
  const onVisible = () => document.visibilityState === "visible" && check();
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
