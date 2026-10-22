import { ONLINE_PAYMENT_METHODS, type DeliveryConfig } from "./types.ts";

/** Parte da configuração que precisa ser corrigida: o painel abre o editor correspondente. */
export type ReadinessArea = "payment" | "areas";
export type ReadinessIssue = { area: ReadinessArea; message: string };

/**
 * O que impede um cliente de concluir um pedido com a configuração atual (lista vazia = pronto).
 * Mesmas regras do servidor: forma de pagamento habilitada (createDeliveryOrder), cidade/bairro atendido
 * (resolveDeliveryFee) e loja + faixa ou área ativa no mapa (resolveMapDeliveryFee).
 * `onlineMethods`: formas online que funcionam neste ambiente (as demais não aparecem para o cliente). Omitido = todas.
 */
export function deliveryReadiness(config: DeliveryConfig, opts: { onlineMethods?: string[] } = {}): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const methods = config.paymentMethods || [];
  const online = opts.onlineMethods;
  const usable = online ? methods.filter((m) => !ONLINE_PAYMENT_METHODS.has(m) || online.includes(m)) : methods;
  if (!methods.length) issues.push({ area: "payment", message: "Nenhuma forma de pagamento selecionada." });
  else if (!usable.length) issues.push({ area: "payment", message: "Só há formas de pagamento online selecionadas, e o pagamento online não está disponível agora." });

  const mode = config.feeMode || "taxa_fixa";
  const activeCities = (config.servedCities || []).filter((c) => c.enabled !== false);
  if (mode === "taxa_por_bairro" && !activeCities.length) {
    issues.push({ area: "areas", message: "Taxa por bairro sem nenhuma cidade ativa: adicione a cidade e os bairros atendidos." });
  }
  if (mode === "area_mapa") {
    const map = config.mapConfig;
    if (!map?.storeLocation) issues.push({ area: "areas", message: "Área no mapa sem o ponto da loja definido." });
    else if (![...(map.distanceBands || []), ...(map.customAreas || [])].some((area) => area.enabled)) {
      issues.push({ area: "areas", message: "Área no mapa sem nenhuma faixa ou área ativa." });
    }
  }
  if (mode === "taxa_fixa" && (config.servedCities || []).length > 0 && !activeCities.length) {
    issues.push({ area: "areas", message: "Todas as cidades cadastradas estão pausadas." });
  }
  return issues;
}
