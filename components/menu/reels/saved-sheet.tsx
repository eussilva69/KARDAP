"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bookmark, LogOut, UtensilsCrossed, X } from "lucide-react";
import { brl, productCents } from "@/lib/format";
import { useDialog } from "@/lib/hooks";
import { signOutCustomer, type SavedItem } from "@/lib/reels";
import { linkedUid } from "@/lib/sso/client";
import { Button } from "@/components/ui/primitives";
import type { Dish } from "../dish-row";
import { AccountForm } from "./account-form";
import type { Engagement, RestaurantRef } from "./use-engagement";

/** A conta do painel do restaurante (login do dono) não sai por aqui: o logout dela é no painel. */
const isPanelAccount = (uid: string) => {
  try {
    return linkedUid() === uid || localStorage.getItem("kardap-restaurant-owner") === uid;
  } catch {
    return false;
  }
};

function Thumb({ src }: { src: string }) {
  return (
    <span className="kd-saved-thumb" aria-hidden>
      {src ? <img src={src} alt="" width={56} height={56} loading="lazy" decoding="async" /> : <UtensilsCrossed size={18} />}
    </span>
  );
}

/** Pratos salvos: os deste cardápio primeiro (abrem em tela cheia), depois os de outros restaurantes (link). */
export function SavedSheet({
  restaurant,
  engagement,
  dishes,
  onOpen,
  onClose,
}: {
  restaurant: RestaurantRef;
  engagement: Engagement;
  /** Pratos disponíveis agora neste cardápio, por id (preço atual e se ainda está no cardápio). */
  dishes: Map<string, Dish>;
  onOpen: (productId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useDialog(ref, onClose);
  const { saved, account, removeSaved, onSignedIn, onSignedOut, refresh } = engagement;

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const here = saved.filter((item) => item.restaurantId === restaurant.id);
  const others = saved.filter((item) => item.restaurantId !== restaurant.id);

  const signOut = async () => {
    setLeaving(true);
    try {
      await signOutCustomer();
      onSignedOut();
    } finally {
      setLeaving(false);
    }
  };

  const row = (item: SavedItem) => {
    const local = item.restaurantId === restaurant.id;
    const dish = local ? dishes.get(item.productId) : undefined;
    const thumb = dish ? dish.imageThumb || dish.videoPoster || dish.image || "" : item.image;
    const body = (
      <>
        <Thumb src={thumb} />
        <span className="kd-saved-text">
          <b>{dish?.name || item.name}</b>
          <small>
            {local ? (dish ? <span className="kd-num">{brl(productCents(dish))}</span> : "Indisponível no momento") : item.restaurantName || "Outro restaurante"}
          </small>
        </span>
      </>
    );
    return (
      <li key={`${item.restaurantId}_${item.productId}`} className="kd-saved-row">
        {local ? (
          <button type="button" className="kd-saved-open" onClick={() => onOpen(item.productId)} disabled={!dish}>
            {body}
          </button>
        ) : (
          <a className="kd-saved-open" href={`/r/${encodeURIComponent(item.restaurantSlug)}?reel=${encodeURIComponent(item.productId)}`}>
            {body}
          </a>
        )}
        <button type="button" className="kd-icon-btn" onClick={() => removeSaved(item)} aria-label={`Remover ${dish?.name || item.name} dos salvos`}>
          <X size={18} />
        </button>
      </li>
    );
  };

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="kd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="kd-sheet-head">
          <div>
            <p className="kd-overline">{account ? account.email || "Sua conta" : "Neste celular"}</p>
            <h2 id={titleId} className="kd-h2">
              Salvos
            </h2>
          </div>
          <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Fechar" data-autofocus>
            <X size={20} />
          </button>
        </header>
        <div className="kd-sheet-body">
          {saved.length === 0 ? (
            <div className="kd-empty kd-empty--compact">
              <span className="kd-empty-icon" aria-hidden>
                <Bookmark size={22} />
              </span>
              <p className="kd-empty-text">Toque em “Salvar” nos vídeos dos pratos para guardar os que você quer pedir depois.</p>
            </div>
          ) : (
            <>
              {here.length > 0 && (
                <section className="kd-saved-group" aria-label={`Salvos de ${restaurant.name}`}>
                  {others.length > 0 && <h3 className="kd-label">{restaurant.name}</h3>}
                  <ul className="kd-saved-list">{here.map(row)}</ul>
                </section>
              )}
              {others.length > 0 && (
                <section className="kd-saved-group" aria-label="Salvos de outros restaurantes">
                  <h3 className="kd-label">Outros restaurantes</h3>
                  <ul className="kd-saved-list">{others.map(row)}</ul>
                </section>
              )}
            </>
          )}

          {account ? (
            !isPanelAccount(account.uid) && (
              <Button variant="ghost" icon={<LogOut size={17} aria-hidden />} loading={leaving} onClick={signOut}>
                Sair da conta
              </Button>
            )
          ) : joining ? (
            <section className="kd-saved-join" aria-label="Entrar ou criar conta">
              <p className="kd-save-lead">Guarde seus salvos numa conta para vê-los em qualquer celular.</p>
              <AccountForm onDone={onSignedIn} />
            </section>
          ) : (
            <div className="kd-saved-cta">
              <p>Estes salvos ficam só neste celular.</p>
              <Button variant="secondary" onClick={() => setJoining(true)}>
                Salvar na sua conta
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
