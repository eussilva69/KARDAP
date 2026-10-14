"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { CSRF_HEADER } from "@/lib/sso/config";
import { watchSsoState } from "@/lib/sso/client";
import { csrfToken, goToLogin, pdvLogout, requestCode } from "@/lib/sso/pdv-client";
import { pdvAuth } from "@/lib/sso/pdv-firebase";
import type { AppRestaurant } from "@/lib/sso/pdv-server";

type PdvAuth = { user: User; restaurants: AppRestaurant[]; logout: (everywhere?: boolean) => Promise<void> };
const PdvAuthContext = createContext<PdvAuth | null>(null);

/** Usuário do PDV (mesmo uid do KARDAP), restaurantes liberados e logout compartilhado. */
export function usePdvAuth() {
  const value = useContext(PdvAuthContext);
  if (!value) throw new Error("usePdvAuth precisa estar dentro de <PdvAuthProvider>.");
  return value;
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; user: User; restaurants: AppRestaurant[]; auth: Auth };

/**
 * Conecta o Firebase Client SDK do PDV à sessão central (SSO_INTEGRATION.md):
 * 1. pede ao servidor central um código de uso único (POST kardapp.online/api/sso/code, CORS + CSRF);
 * 2. entrega o código ao servidor do PDV (POST /api/auth/firebase-token, mesma origem, CSRF), que o troca no
 *    servidor central com o segredo do cliente e devolve o custom token no corpo;
 * 3. signInWithCustomToken com persistência SÓ em memória (nenhum token em localStorage/IndexedDB);
 * 4. vigia o cookie de estado (logout em qualquer aba ou aplicativo) e confere a sessão a cada 2 minutos.
 *
 * `auth`: instância do Auth do PDV, se ela não vier de lib/sso/pdv-firebase.ts (estável; só em componentes de cliente).
 */
export function PdvAuthProvider({ children, auth: provided, fallback = null }: { children: React.ReactNode; auth?: Auth; fallback?: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // Só no navegador: o Auth do PDV nunca é criado na renderização do servidor.
    const auth = provided || pdvAuth();
    let alive = true;
    let ready = false;
    const end = () => {
      alive = false;
      signOut(auth)
        .catch(() => undefined)
        .finally(() => goToLogin());
    };

    const connect = async () => {
      await setPersistence(auth, inMemoryPersistence);
      const grant = await requestCode();
      if (grant.status === 401) return end();
      if (grant.status === 403 && grant.error === "forbidden") return window.location.replace("/sem-permissao");
      if (!grant.code) throw new Error(grant.error || "code");
      const res = await fetch("/api/auth/firebase-token", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", [CSRF_HEADER]: await csrfToken() },
        body: JSON.stringify({ code: grant.code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return end();
      if (res.status === 403 && data.error === "forbidden") return window.location.replace("/sem-permissao");
      if (!res.ok || typeof data.token !== "string") throw new Error(data.error || "token");
      const { user } = await signInWithCustomToken(auth, data.token);
      if (!alive) return;
      ready = true;
      setState({ status: "ready", user, restaurants: Array.isArray(data.restaurants) ? data.restaurants : [], auth });
    };
    connect().catch(() => alive && setState({ status: "error" }));

    // Refresh token revogado ("sair de todos os aparelhos"): o próprio SDK desconecta; o PDV acompanha.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (ready && !user && alive) end();
    });
    const check = async () => {
      const res = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (!alive || !res) return;
      if (res.status === 401) return end();
      if (res.status === 403) return window.location.replace("/sem-permissao");
      const data = await res.json().catch(() => ({}));
      // Outra conta entrou neste navegador: esta aba não continua com a anterior.
      if (res.ok && data.uid && auth.currentUser && data.uid !== auth.currentUser.uid) end();
    };
    const stop = watchSsoState({ onEnded: end, onReplaced: check });
    const timer = window.setInterval(check, 120_000);
    return () => {
      alive = false;
      unsubscribe();
      stop();
      window.clearInterval(timer);
    };
  }, [provided]);

  const logout = useCallback(
    (everywhere = false) => (state.status === "ready" ? pdvLogout(state.auth, everywhere) : Promise.resolve()),
    [state],
  );

  if (state.status === "error") {
    return (
      <div role="alert" style={{ padding: 24, textAlign: "center" }}>
        <p>Não foi possível conectar ao PDV. Verifique a internet e tente de novo.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (state.status !== "ready") return <>{fallback}</>;
  return <PdvAuthContext.Provider value={{ user: state.user, restaurants: state.restaurants, logout }}>{children}</PdvAuthContext.Provider>;
}
