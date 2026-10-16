"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BookOpen, Check, ChevronRight, LoaderCircle, ReceiptText, Star } from "lucide-react";
import { createServiceRequest, watchServiceRequest, type ChamadoStatus, type ServiceRequestType } from "@/lib/restaurant-db";
import { friendlyError, isTimeout } from "@/lib/async";
import { playCallTone } from "@/lib/call-tone";
import { Panel } from "./panel";
import type { PublicRestaurant, TableState } from "./public-menu";

type RequestState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "open"; id: string; status: ChamadoStatus; duplicate: boolean }
  | { phase: "error"; message: string };

const COPY: Record<ServiceRequestType, { sent: string; duplicate: string; progress: string; done: string }> = {
  call_waiter: {
    sent: "Garçom chamado! Aguarde um momento.",
    duplicate: "O garçom já foi chamado para esta mesa. Aguarde um momento.",
    progress: "Um garçom está a caminho da sua mesa.",
    done: "Atendimento concluído. Se precisar, chame de novo.",
  },
  request_bill: {
    sent: "Conta solicitada! Nossa equipe irá até sua mesa.",
    duplicate: "A conta já foi solicitada para esta mesa. Nossa equipe irá até você.",
    progress: "A equipe está preparando sua conta.",
    done: "Solicitação de conta atendida pela equipe.",
  },
};

const isTableError = (error: unknown) => ["no-table", "invalid-table"].includes(String((error as { code?: string } | null)?.code));

/** Identifica este aparelho nas solicitações, sem exigir login do cliente. */
function guestSessionId() {
  try {
    let id = localStorage.getItem("kardap-guest-session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("kardap-guest-session", id);
    }
    return id;
  } catch {
    return "";
  }
}

function useServiceRequest(restaurantId: string, tableToken: string, type: ServiceRequestType) {
  const [state, setState] = useState<RequestState>({ phase: "idle" });
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const openId = state.phase === "open" ? state.id : "";

  // Acompanha a solicitação em tempo real: quando a equipe conclui, o botão volta a ficar disponível.
  useEffect(() => {
    if (!openId) return;
    return watchServiceRequest(restaurantId, openId, (status) => {
      if (status === "concluido" || status === null) {
        setState({ phase: "idle" });
        if (status === "concluido") setNotice(COPY[type].done);
        return;
      }
      setState((current) => (current.phase === "open" ? { ...current, status } : current));
    });
  }, [restaurantId, openId, type]);

  const send = async () => {
    if (inFlight.current || state.phase === "open") return;
    inFlight.current = true;
    setNotice("");
    setState({ phase: "sending" });
    try {
      const result = await createServiceRequest({ restaurantId, tableToken, type, sessionId: guestSessionId() });
      setState({ phase: "open", id: result.id, status: "ativo", duplicate: result.duplicate });
      if (!result.duplicate) playCallTone();
    } catch (error) {
      setState({
        phase: "error",
        message:
          isTableError(error)
            ? (error as Error).message
            : isTimeout(error)
              ? "A solicitação não foi confirmada: a internet está muito lenta. Tente de novo ou chame alguém da equipe."
              : friendlyError(error, "Não conseguimos avisar a equipe. Tente de novo ou chame alguém pessoalmente."),
      });
    } finally {
      inFlight.current = false;
    }
  };

  const message =
    state.phase === "open"
      ? state.status === "andamento"
        ? COPY[type].progress
        : state.duplicate
          ? COPY[type].duplicate
          : COPY[type].sent
      : state.phase === "error"
        ? state.message
        : notice;
  return { state, send, message };
}

export default function QrHome({
  restaurant,
  tableToken,
  tableName,
  tableState,
  menuHref,
}: {
  restaurant: PublicRestaurant;
  tableToken: string;
  tableName: string;
  tableState: TableState;
  menuHref: string;
}) {
  const { settings, brand } = restaurant;
  const waiter = useServiceRequest(restaurant.id, tableToken, "call_waiter");
  const bill = useServiceRequest(restaurant.id, tableToken, "request_bill");
  const [confirmBill, setConfirmBill] = useState(false);
  const reviewUrl = settings.google && settings.googleReviewUrl ? settings.googleReviewUrl : "";
  const tableReady = tableState === "valid";

  return (
    <div className="pm-app">
      <div className="pm-column pm-home">
        <main className="pm-home-main">
          <header className="pm-home-head">
            <span className="pm-home-logo">
              {brand.logo ? <img src={brand.logo} alt="" width={76} height={76} decoding="async" /> : (restaurant.name.trim()[0] || "K").toUpperCase()}
            </span>
            <h1 className="pm-home-name">{restaurant.name || "Bem-vindo(a)"}</h1>
            <p className="pm-home-welcome">
              <span>Bem-vindo(a)!</span>
              {settings.welcomeMessage?.trim() || "O que você deseja fazer hoje?"}
            </p>
            {tableState === "valid" && tableName && <span className="pm-home-table">{tableName}</span>}
            {tableState === "checking" && <span className="pm-home-table pm-skel" style={{ width: 72, height: 26 }} aria-label="Identificando a mesa" />}
            {tableState === "invalid" && (
              <p className="pm-home-hint" role="status">
                Não reconhecemos o QR Code desta mesa. Você pode ver o cardápio; para chamar a equipe, peça ajuda no balcão.
              </p>
            )}
          </header>

          <nav className="pm-home-actions" aria-label="O que você deseja fazer">
            <Link className="pm-action pm-action--primary" href={menuHref}>
              <BookOpen size={20} strokeWidth={1.8} aria-hidden />
              <span>Ver cardápio</span>
              <ChevronRight size={16} aria-hidden />
            </Link>

            {reviewUrl && (
              <a className="pm-action" href={reviewUrl} target="_blank" rel="noopener noreferrer">
                <Star size={20} strokeWidth={1.8} aria-hidden />
                <span>Avaliar no Google</span>
                <ChevronRight size={16} aria-hidden />
              </a>
            )}

            {settings.waiter && (
              <ActionButton
                icon={<Bell size={20} strokeWidth={1.8} aria-hidden />}
                label="Chamar garçom"
                sentLabel="Garçom chamado"
                request={waiter}
                disabled={tableState === "checking"}
                onClick={waiter.send}
              />
            )}

            {settings.bill && (
              <ActionButton
                icon={<ReceiptText size={20} strokeWidth={1.8} aria-hidden />}
                label="Pedir a conta"
                sentLabel="Conta solicitada"
                request={bill}
                disabled={tableState === "checking"}
                // Sem mesa válida não existe conta para fechar: o hook devolve a mensagem sem gravar nada.
                onClick={() => (tableReady ? setConfirmBill(true) : bill.send())}
              />
            )}
          </nav>
        </main>

        <p className="pm-signature">
          Uma experiência <b>KARDAP</b>
        </p>
      </div>

      {confirmBill && (
        <Panel
          title="Pedir a conta"
          onClose={() => setConfirmBill(false)}
          footer={
            <div className="pm-stack">
              <button
                type="button"
                className="pm-btn"
                onClick={() => {
                  setConfirmBill(false);
                  bill.send();
                }}
              >
                Confirmar pedido da conta
              </button>
              <button type="button" className="pm-btn pm-btn--outline" onClick={() => setConfirmBill(false)}>
                Cancelar
              </button>
            </div>
          }
        >
          <div className="pm-block pm-stack">
            <p className="pm-home-confirm">
              Vamos avisar a equipe que a <b>{tableName}</b> deseja fechar a conta.
            </p>
            <p className="pm-muted pm-small">O pagamento é feito com a equipe. Nenhuma cobrança é realizada por aqui.</p>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  sentLabel,
  request,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sentLabel: string;
  request: ReturnType<typeof useServiceRequest>;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { state, message } = request;
  const open = state.phase === "open";
  const sending = state.phase === "sending";
  return (
    <div className="pm-action-wrap">
      <button
        type="button"
        className={`pm-action ${open ? "is-done" : ""}`}
        onClick={onClick}
        disabled={disabled || sending || open}
        aria-busy={sending || undefined}
      >
        {sending ? <LoaderCircle size={20} className="pm-spin" aria-hidden /> : open ? <Check size={20} strokeWidth={2} aria-hidden /> : icon}
        <span>{sending ? "Enviando…" : open ? sentLabel : label}</span>
        {!open && !sending && <ChevronRight size={16} aria-hidden />}
      </button>
      {message && (
        <p className={state.phase === "error" ? "pm-alert" : "pm-success"} role={state.phase === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}
    </div>
  );
}
