"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isQueued } from "@/lib/async";
import {
  accountSaved,
  currentCustomer,
  fetchMyLikes,
  localLikes,
  localSaved,
  mergeSaved,
  setLike,
  setSaved,
  type Customer,
  type SavedItem,
} from "@/lib/reels";

export type RestaurantRef = { id: string; slug: string; name: string; logo: string };
export type SaveInput = Pick<SavedItem, "productId" | "name" | "priceCents" | "image">;
export type Engagement = ReturnType<typeof useEngagement>;

const REFRESH_TTL_MS = 60_000;

/**
 * Curtidas e salvos do cardápio. A tela muda na hora do toque; a gravação segue atrás numa fila por prato
 * que termina sempre no estado do último toque (curtir e descurtir rápido não gera gravações cruzadas).
 *
 * Contador: o cardápio recebe `likes` do Firestore em tempo real, e o próprio SDK já soma a gravação desta
 * pessoa assim que ela entra na fila local. `counted` guarda quais curtidas desta pessoa já estão nesse
 * número; a diferença para o que a tela mostra (`liked`) é somada na exibição.
 */
export function useEngagement(restaurant: RestaurantRef) {
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [saved, setSavedList] = useState<SavedItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notice, setNotice] = useState("");
  const likedRef = useRef(liked);
  const counted = useRef<Set<string>>(new Set());
  const desired = useRef(new Map<string, boolean>());
  const busy = useRef(new Set<string>());
  // Contam toques em curtir/salvar: uma leitura do servidor que começou antes de um toque não o desfaz.
  const likeOps = useRef(0);
  const saveOps = useRef(0);
  /** Última conferência com o servidor que deu certo: abrir e fechar o feed não repete a leitura. */
  const refreshedAt = useRef(0);

  const applyLiked = (next: Set<string>) => {
    likedRef.current = next;
    setLiked(next);
  };

  // O que está guardado neste celular aparece sem esperar a rede (e sem carregar o login).
  useEffect(() => {
    if (!restaurant.id) return;
    const local = localLikes(restaurant.id);
    counted.current = new Set(local);
    applyLiked(local);
    setSavedList(localSaved());
  }, [restaurant.id]);

  /**
   * Confere com o servidor: quem está usando, as curtidas desta pessoa e os salvos da conta.
   * Sem `force`, não repete uma conferência feita há menos de um minuto.
   */
  const refresh = useCallback(
    async (force = false) => {
      if (!restaurant.id) return;
      if (!force && Date.now() - refreshedAt.current < REFRESH_TTL_MS) return;
      refreshedAt.current = Date.now();
      const likeGen = likeOps.current;
      const saveGen = saveOps.current;
      try {
        const who = await currentCustomer();
        setCustomer(who);
        if (!who) return;
        const [likes, account] = await Promise.all([fetchMyLikes(restaurant.id), accountSaved()]);
        if (likeOps.current === likeGen && busy.current.size === 0) {
          counted.current = new Set(likes);
          applyLiked(new Set(likes));
        }
        if (saveOps.current === saveGen && account.length) setSavedList(mergeSaved(localSaved(), account));
      } catch {
        // Sem rede: fica valendo o que está no celular, e a próxima abertura tenta de novo.
        refreshedAt.current = 0;
      }
    },
    [restaurant.id],
  );

  useEffect(() => {
    refreshedAt.current = 0;
  }, [restaurant.id]);

  const flush = useCallback(
    async (productId: string) => {
      if (busy.current.has(productId)) return;
      busy.current.add(productId);
      try {
        for (;;) {
          const want = desired.current.get(productId);
          if (want === undefined || want === counted.current.has(productId)) break;
          const step = { queued: false };
          try {
            await setLike(restaurant.id, productId, want, () => {
              step.queued = true;
              if (want) counted.current.add(productId);
              else counted.current.delete(productId);
            });
          } catch (error) {
            // Na fila local do Firestore (internet lenta ou ausente): será enviada quando a conexão voltar.
            if (step.queued && isQueued(error)) break;
            // Recusada: o SDK desfaz a soma no contador, então aqui também.
            if (step.queued) {
              if (want) counted.current.delete(productId);
              else counted.current.add(productId);
            }
            throw error;
          }
        }
        desired.current.delete(productId);
      } catch {
        desired.current.delete(productId);
        const truth = await fetchMyLikes(restaurant.id).catch(() => null);
        if (truth) counted.current = truth;
        const next = new Set(likedRef.current);
        if (counted.current.has(productId)) next.add(productId);
        else next.delete(productId);
        applyLiked(next);
        setNotice("Não foi possível registrar a curtida agora. Tente de novo.");
      } finally {
        busy.current.delete(productId);
      }
    },
    [restaurant.id],
  );

  const toggleLike = useCallback(
    (productId: string, value?: boolean) => {
      const current = likedRef.current;
      const want = value ?? !current.has(productId);
      if (want === current.has(productId)) return;
      likeOps.current += 1;
      const next = new Set(current);
      if (want) next.add(productId);
      else next.delete(productId);
      applyLiked(next);
      desired.current.set(productId, want);
      void flush(productId);
    },
    [flush],
  );

  /** Número a exibir: o do Firestore mais o toque desta pessoa que ainda não entrou nele. */
  const likeCount = useCallback(
    (productId: string, serverLikes: number | undefined) =>
      Math.max(0, (Number(serverLikes) || 0) + (liked.has(productId) ? 1 : 0) - (counted.current.has(productId) ? 1 : 0)),
    [liked],
  );

  const savedHere = useMemo(() => new Set(saved.filter((s) => s.restaurantId === restaurant.id).map((s) => s.productId)), [saved, restaurant.id]);

  /** Salva ou remove. Retorna onde ficou: "conta" ou "aparelho". */
  const toggleSave = useCallback(
    async (item: SaveInput, value: boolean) => {
      saveOps.current += 1;
      const full: SavedItem = { ...item, restaurantId: restaurant.id, restaurantSlug: restaurant.slug, restaurantName: restaurant.name, savedAt: Date.now() };
      setSavedList((list) => (value ? mergeSaved(list, [full]) : list.filter((s) => !(s.restaurantId === full.restaurantId && s.productId === full.productId))));
      try {
        return await setSaved(full, value);
      } catch {
        setNotice(value ? "Salvo neste celular. Sua conta será atualizada quando a conexão voltar." : "Removido deste celular. Sua conta será atualizada quando a conexão voltar.");
        return "aparelho" as const;
      }
    },
    [restaurant.id, restaurant.slug, restaurant.name],
  );

  /** Remove um salvo de qualquer restaurante (lista de salvos). */
  const removeSaved = useCallback(async (item: SavedItem) => {
    saveOps.current += 1;
    setSavedList((list) => list.filter((s) => !(s.restaurantId === item.restaurantId && s.productId === item.productId)));
    await setSaved(item, false).catch(() => setNotice("Removido deste celular. Sua conta será atualizada quando a conexão voltar."));
  }, []);

  /** Depois de entrar ou criar a conta: os salvos do celular já subiram; a lista passa a ser a da conta. */
  const onSignedIn = useCallback(
    async (who: Customer) => {
      setCustomer(who);
      const saveGen = saveOps.current;
      try {
        const account = await accountSaved();
        if (saveOps.current === saveGen) setSavedList(mergeSaved(localSaved(), account));
      } catch {}
      void refresh(true);
    },
    [refresh],
  );

  const onSignedOut = useCallback(() => {
    setCustomer(null);
    setSavedList(localSaved());
  }, []);

  const clearNotice = useCallback(() => setNotice(""), []);
  const account = customer && !customer.anonymous ? customer : null;
  return { liked, likeCount, saved, savedHere, account, notice, clearNotice, refresh, toggleLike, toggleSave, removeSaved, onSignedIn, onSignedOut };
}
