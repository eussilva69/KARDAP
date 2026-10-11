"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, Check, ConciergeBell, X } from "lucide-react";
import { friendlyError, isTimeout } from "@/lib/async";
import { useDialog } from "@/lib/hooks";
import { Button, TextField } from "@/components/ui/primitives";

/** Motivos enviados como tipo do chamado. Os textos são os mesmos usados nos relatórios do painel. */
const WAITER_REASONS = ["Fazer um pedido", "Tirar dúvida sobre o cardápio", "Solicitar guardanapo, talher ou gelo"];
export const BILL_REASON = "Fechar a conta (Cartão / Pix / Dinheiro)";
const HELP_REASON = "Preciso de atendimento na mesa";

export type CallIntent = "waiter" | "bill" | "order";

export function CallSheet({
  table,
  intent,
  allowWaiter,
  allowBill,
  onSend,
  onClose,
}: {
  table: string;
  intent: CallIntent;
  allowWaiter: boolean;
  allowBill: boolean;
  onSend: (reason: string, tableLabel: string) => Promise<void>;
  onClose: () => void;
}) {
  const options = [...(allowWaiter ? WAITER_REASONS : []), ...(allowBill ? [BILL_REASON] : []), ...(allowWaiter ? [HELP_REASON] : [])];
  const preferred = intent === "bill" ? BILL_REASON : intent === "order" ? "Fazer um pedido" : HELP_REASON;
  const [reason, setReason] = useState(options.includes(preferred) ? preferred : options[0]);
  const [manualTable, setManualTable] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sending = state === "sending";
  useDialog(ref, () => {
    if (!sending) onClose();
  });

  const typed = manualTable.trim();
  const tableLabel = table || (typed ? (/^\d+$/.test(typed) ? `Mesa ${typed}` : typed) : "Mesa não identificada");

  const send = async () => {
    setState("sending");
    setError("");
    try {
      await onSend(reason, tableLabel);
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(
        isTimeout(err)
          ? "O chamado não foi confirmado: a internet está lenta. Tente de novo ou acene para alguém da equipe."
          : friendlyError(err, "Não conseguimos avisar a equipe. Tente de novo ou acene para alguém da equipe."),
      );
    }
  };

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={() => !sending && onClose()} aria-hidden />
      <div ref={ref} className="kd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {state === "sent" ? (
          <div className="kd-sheet-done" role="status">
            <span className="kd-sheet-done-icon" aria-hidden>
              <Check size={30} strokeWidth={2.6} />
            </span>
            <h2 id={titleId} className="kd-h2">
              A equipe foi avisada
            </h2>
            <p className="kd-sheet-done-detail">
              <b>{tableLabel}</b> · {reason}
            </p>
            <p className="kd-muted">Fique à vontade: alguém da equipe já vai até a sua mesa.</p>
            <Button size="lg" block onClick={onClose} data-autofocus>
              Voltar ao cardápio
            </Button>
          </div>
        ) : (
          <>
            <header className="kd-sheet-head">
              <div>
                <p className="kd-overline">{table ? table : "Mesa não identificada"}</p>
                <h2 id={titleId} className="kd-h2">
                  {intent === "bill" && !allowWaiter ? "Pedir a conta" : "Chamar a equipe"}
                </h2>
              </div>
              <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Fechar" disabled={sending}>
                <X size={20} />
              </button>
            </header>

            <div className="kd-sheet-body">
              {!table && (
                <TextField
                  label="Qual é a sua mesa?"
                  optional
                  inputMode="text"
                  placeholder="Ex.: 12 ou Varanda"
                  hint="Não conseguimos identificar a mesa pelo QR Code. Assim a equipe sabe onde ir."
                  value={manualTable}
                  maxLength={30}
                  onChange={(e) => setManualTable(e.target.value)}
                />
              )}
              {options.length > 1 && (
                <fieldset className="kd-sheet-reasons">
                  <legend className="kd-label">Motivo</legend>
                  {options.map((option) => (
                    <label key={option} className={`kd-reason ${reason === option ? "is-checked" : ""}`}>
                      <input type="radio" name="kd-call-reason" value={option} checked={reason === option} onChange={() => setReason(option)} disabled={sending} data-autofocus={option === preferred || undefined} />
                      <span>{option}</span>
                      <span className="kd-reason-mark" aria-hidden />
                    </label>
                  ))}
                </fieldset>
              )}
              {error && (
                <div className="kd-sheet-error" role="alert">
                  <AlertCircle size={18} aria-hidden />
                  <p>{error}</p>
                </div>
              )}
            </div>

            <footer className="kd-sheet-foot">
              <Button variant="signal" size="lg" block loading={sending} onClick={send} icon={<ConciergeBell size={19} aria-hidden />}>
                {sending ? "Avisando a equipe…" : error ? "Tentar de novo" : reason === BILL_REASON ? "Pedir a conta" : "Chamar agora"}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
