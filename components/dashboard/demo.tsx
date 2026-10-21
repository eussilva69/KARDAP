"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { friendlyError, withTimeout } from "@/lib/async";
import { Button, Card, CardHead, ConfirmDialog } from "@/components/ui";
import type { Notify } from "./types";

/** Configurações da conta demonstrativa: volta tudo ao estado inicial depois de uma apresentação. */
export function DemoResetCard({ notify }: { notify: Notify }) {
  const [confirming, setConfirming] = useState(false);
  const reset = async () => {
    try {
      const { getFirebaseAuth } = await import("@/lib/auth");
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
      const res = await withTimeout(fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "{}" }), 60_000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "Não foi possível restaurar a demonstração.");
      notify(`Demonstração restaurada: ${data.orders} pedidos simulados, cardápio e mesas como no início.`);
    } catch (error) {
      notify(friendlyError(error, "Não foi possível restaurar a demonstração."), "error");
      return false;
    }
  };
  return (
    <Card aria-labelledby="kd-demo-reset">
      <CardHead id="kd-demo-reset" kicker="Ambiente de demonstração" title="Restaurar demonstração" />
      <p className="kd-muted">
        Desfaz o que foi alterado numa apresentação — pedidos de teste, chamados, produtos editados, mesas e saques — e recria o histórico simulado com datas
        atualizadas. O login da conta e os outros restaurantes não mudam.
      </p>
      <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => setConfirming(true)}>
        Restaurar demonstração
      </Button>
      {confirming && (
        <ConfirmDialog
          title="Restaurar a demonstração?"
          description="Tudo o que foi feito nesta conta desde a última restauração será apagado e o estado inicial volta. Leva alguns segundos."
          confirmLabel="Restaurar agora"
          onConfirm={reset}
          onClose={() => setConfirming(false)}
        />
      )}
    </Card>
  );
}
