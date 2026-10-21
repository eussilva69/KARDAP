"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAllowedOrigin, readReturnTo, safeRedirect } from "@/lib/sso/config";
import { clearAccountStorage, endSsoSession } from "@/lib/sso/client";
import { Button, SpeedLoader } from "@/components/ui/primitives";

/**
 * /logout?returnTo=… — saída compartilhada: encerra a sessão do SSO (servidor + cookies), o login deste site
 * e volta ao destino (só destinos da lista do SSO). Usada pelo PDV quando não consegue chamar a API direto.
 * Só sai sem perguntar quando o pedido veio de um dos aplicativos; vindo de outro site, pede confirmação
 * (um link malicioso não consegue derrubar a sessão de ninguém).
 */
export default function LogoutPage() {
  const query = useSearchParams();
  const target = safeRedirect(readReturnTo(query)) || "/login";
  const everywhere = query.get("all") === "1";
  const [step, setStep] = useState<"working" | "confirm">("working");

  const run = useCallback(async () => {
    setStep("working");
    await endSsoSession(everywhere);
    if (isFirebaseConfigured) {
      const [{ signOut }, { getFirebaseAuth }] = await Promise.all([import("firebase/auth"), import("@/lib/auth")]);
      await signOut(getFirebaseAuth()).catch(() => undefined);
      const { clearPrivateFirebaseState } = await import("@/lib/firebase");
      await clearPrivateFirebaseState();
    }
    clearAccountStorage();
    window.location.replace(target);
  }, [everywhere, target]);

  useEffect(() => {
    let from = "";
    try {
      from = document.referrer ? new URL(document.referrer).origin : "";
    } catch {
      from = "";
    }
    if (from === window.location.origin || isAllowedOrigin(from)) run();
    else setStep("confirm");
  }, [run]);

  return (
    <main className="kd-state" aria-busy={step === "working" || undefined}>
      {step === "working" ? (
        <SpeedLoader large label="Saindo da sua conta" />
      ) : (
        <>
          <span className="kd-empty-icon" aria-hidden>
            <LogOut size={22} />
          </span>
          <h1 className="kd-state-title">Sair da conta?</h1>
          <p className="kd-state-text">
            {everywhere
              ? "Você sairá do painel KARDAP e do PDV em todos os aparelhos conectados a esta conta."
              : "Você sairá do painel KARDAP e do PDV neste navegador."}
          </p>
          <div className="kd-row" style={{ justifyContent: "center" }}>
            <Button onClick={run}>Sair</Button>
            <Button variant="ghost" onClick={() => window.location.replace("/dashboard")}>
              Continuar conectado
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
