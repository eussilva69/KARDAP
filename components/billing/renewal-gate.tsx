"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, LogOut } from "lucide-react";
import { useDialog } from "@/lib/hooks";
import { brl } from "@/lib/format";
import { toDate, type Entitlements } from "@/lib/billing/plans";
import { Button } from "@/components/ui/primitives";
import { SubscriptionStatus } from "@/components/plans/plan-cards";
import { MY_PLAN_PATH } from "./widgets";

const longDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) || "";

/**
 * Bloqueio obrigatório quando a assinatura não dá mais direito de acesso (`!entitlements.valid`): teste encerrado,
 * carência de pagamento vencida, período pago encerrado, expirada ou suspensa. Cobre o mesmo cálculo usado em toda
 * a aplicação (`resolveEntitlements`), então aparece e some sozinho, em tempo real, assim que a assinatura do
 * restaurante mudar (o documento já é observado por um listener — nenhuma consulta nova).
 *
 * Diferente de `Modal` (components/ui/modal.tsx): aqui não há botão de fechar, clique no fundo não fecha e Esc não
 * fecha — de propósito, é o único bloqueio do produto que não pode ser dispensado pelo cliente.
 */
export function RenewalModal({ entitlements, onRenew, onSignOut, signingOut }: { entitlements: Entitlements; onRenew: () => void; onSignOut: () => void; signingOut: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useDialog(ref, () => {}, mounted); // foco preso e Tab cíclico continuam; Esc não faz nada (sem onClose de verdade)

  const dueDate = longDate(entitlements.accessUntil || entitlements.trialEndsAt);
  const price = entitlements.priceInCents;

  if (!mounted) return null;
  return createPortal(
    <div className="kd-renewal-layer" role="presentation">
      <div className="kd-renewal-backdrop" aria-hidden />
      <div ref={ref} className="kd-renewal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId} className="kd-h2">
          Seu plano precisa ser renovado!
        </h2>
        <p className="kd-lead">
          Sua assinatura do KARDAP está inativa. Para continuar gerenciando seu restaurante e utilizando nossos recursos, renove seu plano e recupere seu
          acesso.
        </p>
        <dl className="kd-renewal-facts">
          <div>
            <dt>Plano contratado</dt>
            <dd>{entitlements.planName}</dd>
          </div>
          <div>
            <dt>Status da assinatura</dt>
            <dd>
              <SubscriptionStatus status={entitlements.status} valid={entitlements.valid} />
            </dd>
          </div>
          {dueDate && (
            <div>
              <dt>Venceu em</dt>
              <dd>{dueDate}</dd>
            </div>
          )}
          {price !== null && (
            <div>
              <dt>Valor da renovação</dt>
              <dd className="kd-num">{brl(price)}/mês</dd>
            </div>
          )}
        </dl>
        <div className="kd-renewal-actions">
          <Button size="lg" block onClick={onRenew} iconEnd={<ArrowRight size={18} aria-hidden />} data-autofocus>
            Renovar meu plano
          </Button>
          <Button size="lg" block variant="ghost" icon={<LogOut size={17} aria-hidden />} loading={signingOut} onClick={onSignOut}>
            {signingOut ? "Saindo…" : "Sair da conta"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Envolve o painel inteiro: quando a assinatura não dá acesso, mostra o bloqueio obrigatório em vez do conteúdo da
 * página — digitar a URL de outra tela do painel não adianta, porque é este componente (não uma rota) que decide o
 * que renderiza. Fica de fora só a própria Meu Plano (`/dashboard/plano`), para dar para pagar e renovar.
 */
export function SubscriptionGate({
  path,
  entitlements,
  router,
  onSignOut,
  signingOut,
  children,
}: {
  path: string;
  entitlements: Entitlements;
  router: { push: (href: string) => void };
  onSignOut: () => void;
  signingOut: boolean;
  children: React.ReactNode;
}) {
  // RenewalModal usa useDialog, que já trava a rolagem da página enquanto está montado.
  const blocked = !entitlements.valid && path !== MY_PLAN_PATH && path !== "/dashboard/assinatura";
  return (
    <>
      {children}
      {blocked && <RenewalModal entitlements={entitlements} onRenew={() => router.push(`${MY_PLAN_PATH}#planos`)} onSignOut={onSignOut} signingOut={signingOut} />}
    </>
  );
}
