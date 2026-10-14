"use client";

import { useId, useRef, useState } from "react";
import { BookmarkCheck, Check, Link as LinkIcon, MessageCircle, X } from "lucide-react";
import { useDialog } from "@/lib/hooks";
import { copyText, reelUrl, shareText } from "@/lib/reels";
import { Button } from "@/components/ui/primitives";
import type { Dish } from "../dish-row";
import { AccountForm } from "./account-form";
import type { Engagement, RestaurantRef } from "./use-engagement";

/**
 * "Salvar na conta": o prato já ficou salvo neste celular no toque. Aqui a pessoa escolhe guardar numa conta
 * de cliente (vê em qualquer aparelho) ou levar o link para outro lugar (WhatsApp, área de transferência).
 */
export function SaveSheet({
  dish,
  restaurant,
  engagement,
  onClose,
  onShowSaved,
}: {
  dish: Dish;
  restaurant: RestaurantRef;
  engagement: Engagement;
  onClose: () => void;
  onShowSaved: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState<boolean | null>(null);
  useDialog(ref, onClose);
  const { account, onSignedIn } = engagement;
  const url = reelUrl(restaurant.slug, dish.id || "");
  const text = shareText(dish.name, restaurant.name);

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="kd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {account ? (
          <div className="kd-sheet-done" role="status">
            <span className="kd-sheet-done-icon" aria-hidden>
              <BookmarkCheck size={28} />
            </span>
            <h2 id={titleId} className="kd-h2">
              Salvo na sua conta
            </h2>
            <p className="kd-sheet-done-detail">
              <b>{dish.name}</b>
            </p>
            <p className="kd-muted">{account.email ? `Conta ${account.email}. ` : ""}Seus pratos salvos aparecem em qualquer celular em que você entrar.</p>
            <Button size="lg" block onClick={onShowSaved} data-autofocus>
              Ver salvos
            </Button>
            <Button variant="ghost" block onClick={onClose}>
              Voltar ao vídeo
            </Button>
          </div>
        ) : (
          <>
            <header className="kd-sheet-head">
              <div>
                <p className="kd-overline">Salvo neste celular</p>
                <h2 id={titleId} className="kd-h2">
                  Guardar na sua conta
                </h2>
              </div>
              <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Fechar">
                <X size={20} />
              </button>
            </header>
            <div className="kd-sheet-body">
              <p className="kd-save-lead">
                Crie uma conta grátis para ver <b>{dish.name}</b> e seus outros pratos salvos em qualquer celular, em todos os cardápios Kardap.
              </p>
              <AccountForm onDone={onSignedIn} />
              <p className="kd-save-divider">
                <span>ou salve em outro lugar</span>
              </p>
              <div className="kd-save-other">
                <a className="kd-save-opt" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={20} aria-hidden />
                  Mandar para mim no WhatsApp
                </a>
                <button type="button" className="kd-save-opt" onClick={async () => setCopied(await copyText(url))}>
                  {copied ? <Check size={20} aria-hidden /> : <LinkIcon size={20} aria-hidden />}
                  {copied ? "Link copiado" : copied === false ? "Não foi possível copiar" : "Copiar link do prato"}
                </button>
              </div>
              <p className="kd-save-note">Sem conta, o prato continua salvo só neste celular (em “Salvos”, no topo do cardápio).</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
