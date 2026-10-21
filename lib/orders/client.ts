import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { withTimeout } from "@/lib/async";
import type { DeliveryOrderStatus } from "@/lib/delivery/types";
import { toPanelOrder, type PanelOrder } from "./metrics";

/**
 * Pedidos do estabelecimento a partir de `sinceIso`, em tempo real (as regras liberam a leitura só para a equipe).
 * Rascunhos do PDV ficam de fora: ainda não são pedidos.
 */
export function watchOrders(restaurantId: string, sinceIso: string, onData: (orders: PanelOrder[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(collection(getDb(), "restaurantes", restaurantId, "pedidos"), where("createdAt", ">=", sinceIso), orderBy("createdAt", "desc"), limit(1500)),
    (snap) => onData(snap.docs.filter((d) => d.get("operationalReady") !== false).map((d) => toPanelOrder(d.id, d.data())).filter((o) => o.status !== "rascunho")),
    onError,
  );
}

/** Altera o status pelo servidor (valida a transição e a equipe; o navegador não grava status direto). */
export async function changeOrderStatus(restaurantId: string, orderId: string, status: DeliveryOrderStatus, reason?: string) {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  const res = await withTimeout(
    fetch(`/api/delivery/orders/${encodeURIComponent(orderId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restaurantId, status, reason }),
    }),
    20000,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.message === "string" ? data.message : "Não foi possível alterar o status do pedido.");
  }
}
