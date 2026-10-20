/**
 * Tipos do sistema financeiro do KARDAP.
 * Todos os valores monetários em centavos inteiros para evitar erros de precisão.
 */

// ─── Status de pagamento ───────────────────────────────────────────────────

export type PaymentStatus = "pendente" | "aprovado" | "recusado" | "cancelado" | "estornado" | "chargeback";
export type SettlementStatus = "aguardando" | "liquidado" | "bloqueado";
export type PayoutStatus = "pendente" | "em_processamento" | "concluido" | "falhou" | "cancelado";
export type WithdrawalStatus = "pending_approval" | "approved" | "paid" | "rejected" | "cancelled";
export type LedgerEntryType = "credito" | "debito" | "estorno" | "ajuste" | "repasse";

// ─── Transação financeira ──────────────────────────────────────────────────

export type FinancialTransaction = {
  id: string;
  restaurant_id: string;
  order_id: string;
  payment_id?: string;
  gateway: string;
  gateway_transaction_id?: string;
  /** Valor bruto da venda em centavos */
  gross_amount_cents: number;
  /** Taxa do gateway em centavos (estimada ou confirmada) */
  gateway_fee_cents: number;
  /** Percentual efetivo do gateway usado no cálculo */
  gateway_fee_percent: number;
  /** Valor após desconto do gateway */
  net_after_gateway_cents: number;
  /** Comissão do KARDAP em centavos */
  kardap_fee_cents: number;
  /** Percentual da comissão do KARDAP usada */
  kardap_fee_percent: number;
  /** Valor líquido do restaurante */
  restaurant_net_cents: number;
  payment_status: PaymentStatus;
  settlement_status: SettlementStatus;
  created_at: string;
  confirmed_at?: string;
  settled_at?: string;
  release_at?: string;
  released_at?: string;
  /** Indica se a taxa do gateway foi confirmada pelo extrato oficial */
  gateway_fee_confirmed: boolean;
};

// ─── Saldo do restaurante ──────────────────────────────────────────────────

export type RestaurantBalance = {
  restaurant_id: string;
  /** Aguardando liquidação */
  pending_cents: number;
  /** Disponível para repasse */
  available_cents: number;
  /** Bloqueado/reservado */
  reserved_cents: number;
  /** Total já repassado */
  paid_out_cents: number;
  updated_at: string;
};

// ─── Repasse ───────────────────────────────────────────────────────────────

export type Payout = {
  id: string;
  restaurant_id: string;
  amount_cents: number;
  pix_key_reference?: string;
  status: PayoutStatus;
  gateway_transfer_id?: string;
  created_by: string;
  created_at: string;
  completed_at?: string;
  failed_at?: string;
  receipt_reference?: string;
  notes?: string;
  destination_info?: string;
};

export type WithdrawalRequest = {
  id: string;
  restaurant_id: string;
  amount_cents: number;
  status: WithdrawalStatus;
  pix_key_reference: string;
  requested_at: string;
  next_withdrawal_allowed_at: string;
  approved_at?: string;
  rejected_at?: string;
  paid_at?: string;
  approved_by?: string;
  rejection_reason?: string;
  payment_proof_reference?: string;
  transfer_transaction_id?: string;
};

// ─── Ledger (livro-razão) ──────────────────────────────────────────────────

export type LedgerEntry = {
  id: string;
  restaurant_id: string;
  transaction_id?: string;
  payout_id?: string;
  type: LedgerEntryType;
  amount_cents: number;
  currency: "BRL";
  description: string;
  created_at: string;
};

// ─── Configurações financeiras ─────────────────────────────────────────────

export type RestaurantFeeOverride = {
  restaurant_id: string;
  gateway_fee_percent?: number;
  kardap_fee_percent?: number;
  updated_at: string;
  updated_by: string;
  reason?: string;
};

export type FinancialSettings = {
  default_gateway_fee_percent: number;
  default_kardap_fee_percent: number;
  restaurant_fee_overrides: Record<string, RestaurantFeeOverride>;
  /** Dias de carência após liquidação para liberar saldo */
  settlement_delay_days: number;
  updated_at: string;
  updated_by: string;
};

export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  default_gateway_fee_percent: 5,
  default_kardap_fee_percent: 2,
  restaurant_fee_overrides: {},
  settlement_delay_days: 15,
  updated_at: "",
  updated_by: "",
};

// ─── Cálculo financeiro ────────────────────────────────────────────────────

export type FeeBreakdown = {
  gross_amount_cents: number;
  gateway_fee_cents: number;
  gateway_fee_percent: number;
  net_after_gateway_cents: number;
  kardap_fee_cents: number;
  kardap_fee_percent: number;
  restaurant_net_cents: number;
};

/** Calcula a divisão financeira de uma venda. Sempre usa centavos inteiros. */
export function calculateFees(grossCents: number, settings: FinancialSettings, restaurantId?: string): FeeBreakdown {
  const override = restaurantId ? settings.restaurant_fee_overrides[restaurantId] : undefined;
  const gatewayPct = override?.gateway_fee_percent ?? settings.default_gateway_fee_percent;
  const kardapPct = override?.kardap_fee_percent ?? settings.default_kardap_fee_percent;

  const gatewayFeeCents = Math.round((grossCents * gatewayPct) / 100);
  const netAfterGateway = grossCents - gatewayFeeCents;
  const kardapFeeCents = Math.round((netAfterGateway * kardapPct) / 100);
  const restaurantNet = netAfterGateway - kardapFeeCents;

  return {
    gross_amount_cents: grossCents,
    gateway_fee_cents: gatewayFeeCents,
    gateway_fee_percent: gatewayPct,
    net_after_gateway_cents: netAfterGateway,
    kardap_fee_cents: kardapFeeCents,
    kardap_fee_percent: kardapPct,
    restaurant_net_cents: restaurantNet,
  };
}

// ─── Sumário consolidado (dashboard admin) ────────────────────────────────

export type FinancialSummary = {
  gross_revenue_cents: number;
  approved_payments_cents: number;
  gateway_fees_cents: number;
  kardap_revenue_cents: number;
  restaurant_total_cents: number;
  available_for_payout_cents: number;
  pending_payout_cents: number;
  completed_payouts_cents: number;
  chargebacks_cents: number;
  unreconciled_cents: number;
  transaction_count: number;
  period_start?: string;
  period_end?: string;
};

export type RestaurantFinancialRow = {
  restaurant_id: string;
  restaurant_name: string;
  approved_count: number;
  gross_cents: number;
  gateway_fee_cents: number;
  kardap_fee_cents: number;
  restaurant_net_cents: number;
  paid_out_cents: number;
  pending_cents: number;
  available_cents: number;
  last_payout_at?: string;
};

// ─── Payload do webhook ────────────────────────────────────────────────────

export type PaymentWebhookPayload = {
  event: string;
  payment_id: string;
  order_id: string;
  restaurant_id: string;
  gateway: string;
  gross_amount_cents: number;
  gateway_fee_cents?: number;
  status: PaymentStatus;
  timestamp: string;
  idempotency_key?: string;
};
