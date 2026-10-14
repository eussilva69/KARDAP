"use client";

import { useId, useRef, useState } from "react";
import { Check, Link as LinkIcon, Mail, MessageCircle, Send, X } from "lucide-react";
import { useDialog } from "@/lib/hooks";
import { copyText, reelUrl, shareText } from "@/lib/reels";
import type { Dish } from "../dish-row";
import type { RestaurantRef } from "./use-engagement";

/** Opções de envio quando o celular não tem a folha de compartilhamento do sistema (ou ela falhou). */
export function ShareSheet({ dish, restaurant, onClose }: { dish: Dish; restaurant: RestaurantRef; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState<boolean | null>(null);
  useDialog(ref, onClose);
  const url = reelUrl(restaurant.slug, dish.id || "");
  const text = shareText(dish.name, restaurant.name);

  const options = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, icon: <MessageCircle size={22} aria-hidden />, external: true },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, icon: <Send size={21} aria-hidden />, external: true },
    { label: "E-mail", href: `mailto:?subject=${encodeURIComponent(dish.name)}&body=${encodeURIComponent(`${text}\n${url}`)}`, icon: <Mail size={21} aria-hidden />, external: false },
  ];

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="kd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="kd-sheet-head">
          <div>
            <p className="kd-overline">Enviar para alguém</p>
            <h2 id={titleId} className="kd-h2">
              {dish.name}
            </h2>
          </div>
          <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="kd-sheet-body">
          <div className="kd-share-grid">
            {options.map((option) => (
              <a key={option.label} className="kd-share-opt" href={option.href} target={option.external ? "_blank" : undefined} rel={option.external ? "noopener noreferrer" : undefined}>
                <span className="kd-share-icon">{option.icon}</span>
                {option.label}
              </a>
            ))}
            <button type="button" className="kd-share-opt" onClick={async () => setCopied(await copyText(url))} data-autofocus>
              <span className="kd-share-icon">{copied ? <Check size={22} aria-hidden /> : <LinkIcon size={21} aria-hidden />}</span>
              {copied ? "Copiado" : "Copiar link"}
            </button>
          </div>
          <p className="kd-share-url" role={copied === false ? "alert" : undefined}>
            {copied === false ? "Não foi possível copiar. Selecione o link abaixo:" : "O link abre o cardápio direto neste prato."}
            <span>{url}</span>
          </p>
          {copied && (
            <p className="kd-sr" role="status">
              Link copiado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
