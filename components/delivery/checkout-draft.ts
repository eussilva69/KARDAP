/**
 * Rascunho do checkout guardado na aba (sessionStorage): sair para editar o carrinho, voltar ao cardápio
 * ou trocar a forma de pagamento não apaga o que a pessoa já digitou. Some ao fechar a aba ou ao concluir o pedido.
 */
export type CheckoutDraft = {
  name: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  ibgeCode: string;
  placeId: string;
  reference: string;
  paymentMethod: string;
  changeFor: string;
  notes: string;
};

const key = (restaurantId: string) => `kardap:delivery-draft:${restaurantId}`;

export function readCheckoutDraft(restaurantId: string): Partial<CheckoutDraft> {
  try {
    const raw = sessionStorage.getItem(key(restaurantId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as Partial<CheckoutDraft>;
  } catch {
    return {};
  }
}

export function saveCheckoutDraft(restaurantId: string, draft: CheckoutDraft) {
  try {
    sessionStorage.setItem(key(restaurantId), JSON.stringify(draft));
  } catch {}
}

export function clearCheckoutDraft(restaurantId: string) {
  try {
    sessionStorage.removeItem(key(restaurantId));
  } catch {}
}
