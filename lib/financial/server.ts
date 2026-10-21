/**
 * Lógica financeira do servidor: criação de transações, gestão de saldos,
 * repasses e sumários consolidados.
 * Todos os cálculos acontecem aqui — nunca no frontend.
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  calculateFees,
  DEFAULT_FINANCIAL_SETTINGS,
  type FinancialSettings,
  type FinancialSummary,
  type FinancialTransaction,
  type LedgerEntry,
  type LedgerEntryType,
  type Payout,
  type PayoutStatus,
  type PaymentStatus,
  type RestaurantBalance,
  type RestaurantFinancialRow,
  type SettlementStatus,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from "./types";

// ─── Referências ──────────────────────────────────────────────────────────

const db = () => adminDb();
const txCol = () => db().collection("financial_transactions");
const balanceDoc = (rid: string) => db().collection("restaurant_balances").doc(rid);
const payoutCol = () => db().collection("payouts");
const withdrawalCol = () => db().collection("withdrawal_requests");
const ledgerCol = () => db().collection("financial_ledger");
const settingsDoc = () => db().collection("financial_settings").doc("global");
const auditCol = () => db().collection("financial_audit_logs");

// ─── Configurações ────────────────────────────────────────────────────────

export async function getFinancialSettings(): Promise<FinancialSettings> {
  const snap = await settingsDoc().get();
  if (!snap.exists) return { ...DEFAULT_FINANCIAL_SETTINGS };
  return { ...DEFAULT_FINANCIAL_SETTINGS, ...(snap.data() as Partial<FinancialSettings>) };
}

export async function saveFinancialSettings(
  patch: Partial<Pick<FinancialSettings, "default_gateway_fee_percent" | "default_kardap_fee_percent" | "settlement_delay_days" | "restaurant_fee_overrides">>,
  adminUid: string,
): Promise<FinancialSettings> {
  const current = await getFinancialSettings();
  const now = new Date().toISOString();
  const next: FinancialSettings = {
    ...current,
    ...patch,
    updated_at: now,
    updated_by: adminUid,
  };
  await settingsDoc().set(next);
  return next;
}

// ─── Criação de transação ─────────────────────────────────────────────────

export type CreateTransactionInput = {
  restaurant_id: string;
  order_id: string;
  payment_id?: string;
  gateway: string;
  gateway_transaction_id?: string;
  gross_amount_cents: number;
  /** Taxa efetiva informada pelo gateway; se omitida, usa a estimativa das configurações */
  gateway_fee_cents_actual?: number;
  payment_status: PaymentStatus;
  idempotency_key: string;
};

/** Cria uma transação financeira e atualiza o saldo do restaurante atomicamente. */
export async function createFinancialTransaction(input: CreateTransactionInput): Promise<FinancialTransaction> {
  const settings = await getFinancialSettings();
  const fees = calculateFees(input.gross_amount_cents, settings, input.restaurant_id);

  // Usa a taxa real do gateway se informada, recalculando o restante
  let finalGatewayFee = fees.gateway_fee_cents;
  let finalNetAfterGateway = fees.net_after_gateway_cents;
  let finalKardapFee = fees.kardap_fee_cents;
  let finalRestaurantNet = fees.restaurant_net_cents;
  let gatewayFeeConfirmed = false;

  if (typeof input.gateway_fee_cents_actual === "number") {
    finalGatewayFee = input.gateway_fee_cents_actual;
    finalNetAfterGateway = input.gross_amount_cents - finalGatewayFee;
    const override = settings.restaurant_fee_overrides[input.restaurant_id];
    const kardapPct = override?.kardap_fee_percent ?? settings.default_kardap_fee_percent;
    finalKardapFee = Math.round((finalNetAfterGateway * kardapPct) / 100);
    finalRestaurantNet = finalNetAfterGateway - finalKardapFee;
    gatewayFeeConfirmed = true;
  }

  const now = new Date().toISOString();
  const releaseAt = new Date(Date.now() + settings.settlement_delay_days * 24 * 60 * 60 * 1000).toISOString();
  const isApproved = input.payment_status === "aprovado";

  const txData: Omit<FinancialTransaction, "id"> = {
    restaurant_id: input.restaurant_id,
    order_id: input.order_id,
    payment_id: input.payment_id,
    gateway: input.gateway,
    gateway_transaction_id: input.gateway_transaction_id,
    gross_amount_cents: input.gross_amount_cents,
    gateway_fee_cents: finalGatewayFee,
    gateway_fee_percent: fees.gateway_fee_percent,
    net_after_gateway_cents: finalNetAfterGateway,
    kardap_fee_cents: finalKardapFee,
    kardap_fee_percent: fees.kardap_fee_percent,
    restaurant_net_cents: finalRestaurantNet,
    payment_status: input.payment_status,
    settlement_status: isApproved ? "aguardando" : "bloqueado",
    created_at: now,
    confirmed_at: isApproved ? now : undefined,
    release_at: isApproved ? releaseAt : undefined,
    gateway_fee_confirmed: gatewayFeeConfirmed,
  };

  const batchOps = db().batch();

  // Idempotência: verifica se já existe transação com a mesma chave
  const existing = await txCol().where("order_id", "==", input.order_id).where("gateway", "==", input.gateway).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return { id: doc.id, ...(doc.data() as Omit<FinancialTransaction, "id">) };
  }

  const txRef = txCol().doc();
  batchOps.set(txRef, txData);

  // Atualiza saldo se pagamento aprovado
  if (isApproved) {
    const balRef = balanceDoc(input.restaurant_id);
    batchOps.set(
      balRef,
      {
        restaurant_id: input.restaurant_id,
        pending_cents: FieldValue.increment(finalRestaurantNet),
        available_cents: FieldValue.increment(0),
        reserved_cents: FieldValue.increment(0),
        paid_out_cents: FieldValue.increment(0),
        updated_at: now,
      },
      { merge: true },
    );

    // Ledger entry
    const ledgerRef = ledgerCol().doc();
    const ledger: Omit<LedgerEntry, "id"> = {
      restaurant_id: input.restaurant_id,
      transaction_id: txRef.id,
      type: "credito",
      amount_cents: finalRestaurantNet,
      currency: "BRL",
      description: `Venda aprovada — pedido ${input.order_id}`,
      created_at: now,
    };
    batchOps.set(ledgerRef, ledger);
  }

  await batchOps.commit();
  return { id: txRef.id, ...txData };
}

// ─── Liquidação (settlement) ───────────────────────────────────────────────

/** Marca a liquidação do gateway. A liberação ao saque permanece individual e só ocorre após release_at. */
export async function settleTransaction(transactionId: string): Promise<void> {
  const now = new Date().toISOString();

  await db().runTransaction(async (tx) => {
    const txRef = txCol().doc(transactionId);
    const snap = await tx.get(txRef);
    if (!snap.exists) throw new Error("Transação não encontrada.");
    const data = snap.data() as FinancialTransaction;
    if (data.settlement_status === "liquidado") return; // já liquidada
    if (data.payment_status !== "aprovado") throw new Error("Não é possível liquidar transação não aprovada.");

    tx.update(txRef, { settlement_status: "liquidado", settled_at: now });
  });
}

/** Libera vendas já aprovadas, liquidadas e cuja carência individual terminou. Idempotente por released_at. */
export async function releaseEligibleTransactions(now = Date.now()): Promise<number> {
  const cutoff = new Date(now).toISOString();
  const eligible = await txCol().where("payment_status", "==", "aprovado").where("settlement_status", "==", "liquidado").where("release_at", "<=", cutoff).limit(500).get();
  let released = 0;
  for (const doc of eligible.docs) {
    const didRelease = await db().runTransaction(async (tx) => {
      const current = await tx.get(doc.ref);
      const data = current.data() as FinancialTransaction | undefined;
      if (!data || data.released_at || data.payment_status !== "aprovado" || data.settlement_status !== "liquidado" || !data.release_at || data.release_at > cutoff) return false;
      const at = new Date(now).toISOString();
      tx.update(doc.ref, { released_at: at });
      tx.set(balanceDoc(data.restaurant_id), { restaurant_id: data.restaurant_id, pending_cents: FieldValue.increment(-data.restaurant_net_cents), available_cents: FieldValue.increment(data.restaurant_net_cents), updated_at: at }, { merge: true });
      tx.set(ledgerCol().doc(), { restaurant_id: data.restaurant_id, transaction_id: doc.id, type: "credito" as LedgerEntryType, amount_cents: data.restaurant_net_cents, currency: "BRL", description: `Saldo liberado após carência — pedido ${data.order_id}`, created_at: at });
      tx.set(db().collection("financial_notifications").doc(), { restaurant_id: data.restaurant_id, type: "funds_released", transaction_id: doc.id, created_at: at, read_at: null });
      return true;
    });
    if (didRelease) released++;
  }
  return released;
}

// ─── Estorno / chargeback ─────────────────────────────────────────────────

export async function reverseTransaction(transactionId: string, reason: string, adminUid: string): Promise<void> {
  const now = new Date().toISOString();

  await db().runTransaction(async (tx) => {
    const txRef = txCol().doc(transactionId);
    const snap = await tx.get(txRef);
    if (!snap.exists) throw new Error("Transação não encontrada.");
    const data = snap.data() as FinancialTransaction;
    if (data.payment_status === "estornado" || data.payment_status === "chargeback") return;

    tx.update(txRef, { payment_status: "estornado", settlement_status: "bloqueado" });

    const balRef = balanceDoc(data.restaurant_id);
    const balSnap = await tx.get(balRef);
    const bal = balSnap.data() as RestaurantBalance | undefined;

    // Debita do saldo disponível (ou pendente, o que houver)
    const availableDebit = Math.min(data.restaurant_net_cents, bal?.available_cents ?? 0);
    const pendingDebit = data.restaurant_net_cents - availableDebit;

    tx.set(
      balRef,
      {
        available_cents: FieldValue.increment(-availableDebit),
        pending_cents: FieldValue.increment(-pendingDebit),
        updated_at: now,
      },
      { merge: true },
    );

    const ledgerRef = ledgerCol().doc();
    tx.set(ledgerRef, {
      restaurant_id: data.restaurant_id,
      transaction_id: transactionId,
      type: "estorno" as LedgerEntryType,
      amount_cents: -data.restaurant_net_cents,
      currency: "BRL",
      description: `Estorno — ${reason} — por ${adminUid}`,
      created_at: now,
    });
  });
}

// ─── Repasses ─────────────────────────────────────────────────────────────

export async function createPayout(
  restaurantId: string,
  amountCents: number,
  adminUid: string,
  options?: { pix_key?: string; notes?: string; destination_info?: string },
): Promise<Payout> {
  if (amountCents <= 0) throw new Error("Valor do repasse deve ser positivo.");

  const now = new Date().toISOString();

  return db().runTransaction(async (tx) => {
    const balRef = balanceDoc(restaurantId);
    const balSnap = await tx.get(balRef);
    if (!balSnap.exists) throw new Error("Saldo não encontrado para este restaurante.");
    const bal = balSnap.data() as RestaurantBalance;

    if (amountCents > bal.available_cents) {
      throw new Error(`Saldo disponível insuficiente. Disponível: ${bal.available_cents} centavos.`);
    }

    // Verifica repasses pendentes (evita duplicatas)
    const pendingSnap = await payoutCol()
      .where("restaurant_id", "==", restaurantId)
      .where("status", "in", ["pendente", "em_processamento"])
      .limit(1)
      .get();
    if (!pendingSnap.empty) {
      throw new Error("Já existe um repasse pendente ou em processamento para este restaurante.");
    }

    const payoutRef = payoutCol().doc();
    const payout: Omit<Payout, "id"> = {
      restaurant_id: restaurantId,
      amount_cents: amountCents,
      pix_key_reference: options?.pix_key,
      status: "pendente",
      created_by: adminUid,
      created_at: now,
      notes: options?.notes,
      destination_info: options?.destination_info,
    };

    tx.set(payoutRef, payout);

    // Move saldo: disponível → reservado
    tx.set(
      balRef,
      {
        available_cents: FieldValue.increment(-amountCents),
        reserved_cents: FieldValue.increment(amountCents),
        updated_at: now,
      },
      { merge: true },
    );

    const ledgerRef = ledgerCol().doc();
    tx.set(ledgerRef, {
      restaurant_id: restaurantId,
      payout_id: payoutRef.id,
      type: "repasse" as LedgerEntryType,
      amount_cents: -amountCents,
      currency: "BRL",
      description: `Repasse iniciado por ${adminUid}`,
      created_at: now,
    });

    return { id: payoutRef.id, ...payout };
  });
}

export async function confirmPayout(
  payoutId: string,
  adminUid: string,
  options: { gateway_transfer_id?: string; receipt_reference?: string; notes?: string },
): Promise<void> {
  const now = new Date().toISOString();

  await db().runTransaction(async (tx) => {
    const payoutRef = payoutCol().doc(payoutId);
    const snap = await tx.get(payoutRef);
    if (!snap.exists) throw new Error("Repasse não encontrado.");
    const payout = snap.data() as Payout;
    if (payout.status === "concluido") return;
    if (payout.status !== "pendente" && payout.status !== "em_processamento") {
      throw new Error(`Repasse não pode ser confirmado no status: ${payout.status}`);
    }
    if (!options.gateway_transfer_id && !options.receipt_reference) {
      throw new Error("É necessário informar o ID da transferência bancária ou o comprovante para confirmar o repasse.");
    }

    tx.update(payoutRef, {
      status: "concluido" as PayoutStatus,
      completed_at: now,
      gateway_transfer_id: options.gateway_transfer_id,
      receipt_reference: options.receipt_reference,
      notes: options.notes,
    });

    const balRef = balanceDoc(payout.restaurant_id);
    tx.set(
      balRef,
      {
        reserved_cents: FieldValue.increment(-payout.amount_cents),
        paid_out_cents: FieldValue.increment(payout.amount_cents),
        updated_at: now,
      },
      { merge: true },
    );

    const ledgerRef = ledgerCol().doc();
    tx.set(ledgerRef, {
      restaurant_id: payout.restaurant_id,
      payout_id: payoutId,
      type: "repasse" as LedgerEntryType,
      amount_cents: -payout.amount_cents,
      currency: "BRL",
      description: `Repasse confirmado — ${options.gateway_transfer_id || options.receipt_reference} — por ${adminUid}`,
      created_at: now,
    });
  });
}

export async function cancelPayout(payoutId: string, adminUid: string, reason?: string): Promise<void> {
  const now = new Date().toISOString();

  await db().runTransaction(async (tx) => {
    const payoutRef = payoutCol().doc(payoutId);
    const snap = await tx.get(payoutRef);
    if (!snap.exists) throw new Error("Repasse não encontrado.");
    const payout = snap.data() as Payout;
    if (payout.status === "concluido") throw new Error("Repasse concluído não pode ser cancelado.");
    if (payout.status === "cancelado") return;

    tx.update(payoutRef, {
      status: "cancelado" as PayoutStatus,
      notes: reason ? `Cancelado por ${adminUid}: ${reason}` : `Cancelado por ${adminUid}`,
    });

    // Devolve valor: reservado → disponível
    const wasReserved = payout.status === "pendente" || payout.status === "em_processamento";
    if (wasReserved) {
      const balRef = balanceDoc(payout.restaurant_id);
      tx.set(
        balRef,
        {
          reserved_cents: FieldValue.increment(-payout.amount_cents),
          available_cents: FieldValue.increment(payout.amount_cents),
          updated_at: now,
        },
        { merge: true },
      );
    }

    const ledgerRef = ledgerCol().doc();
    tx.set(ledgerRef, {
      restaurant_id: payout.restaurant_id,
      payout_id: payoutId,
      type: "ajuste" as LedgerEntryType,
      amount_cents: payout.amount_cents,
      currency: "BRL",
      description: `Repasse cancelado por ${adminUid}${reason ? ": " + reason : ""}`,
      created_at: now,
    });
  });
}

const WITHDRAWAL_INTERVAL_MS = 15 * 24 * 60 * 60 * 1000;

/** Reserva integralmente o saldo disponível para um saque iniciado pelo próprio restaurante. */
export async function requestWithdrawal(restaurantId: string, pixKey: string, now = Date.now()): Promise<WithdrawalRequest> {
  const normalizedPix = pixKey.trim();
  if (normalizedPix.length < 3 || normalizedPix.length > 200) throw new Error("Informe uma chave Pix válida.");
  const at = new Date(now).toISOString();
  const nextAllowed = new Date(now + WITHDRAWAL_INTERVAL_MS).toISOString();
  return db().runTransaction(async (tx) => {
    const balRef = balanceDoc(restaurantId);
    const balSnap = await tx.get(balRef);
    const bal = balSnap.data() as (RestaurantBalance & { active_withdrawal_id?: string; next_withdrawal_allowed_at?: string }) | undefined;
    if (!bal || bal.available_cents <= 0) throw new Error("Não há saldo disponível para saque.");
    if (bal.active_withdrawal_id) throw new Error("Já existe uma solicitação de saque pendente ou em processamento.");
    if (bal.next_withdrawal_allowed_at && bal.next_withdrawal_allowed_at > at) throw new Error(`Próximo saque disponível em ${new Date(bal.next_withdrawal_allowed_at).toLocaleDateString("pt-BR")}.`);
    const ref = withdrawalCol().doc();
    const withdrawal: Omit<WithdrawalRequest, "id"> = { restaurant_id: restaurantId, amount_cents: bal.available_cents, status: "pending_approval", pix_key_reference: normalizedPix, requested_at: at, next_withdrawal_allowed_at: nextAllowed };
    tx.set(ref, withdrawal);
    tx.set(balRef, { available_cents: 0, reserved_cents: FieldValue.increment(bal.available_cents), active_withdrawal_id: ref.id, last_withdrawal_requested_at: at, next_withdrawal_allowed_at: nextAllowed, updated_at: at }, { merge: true });
    tx.set(ledgerCol().doc(), { restaurant_id: restaurantId, payout_id: ref.id, type: "repasse" as LedgerEntryType, amount_cents: -bal.available_cents, currency: "BRL", description: "Saldo reservado para solicitação de saque", created_at: at });
    tx.set(auditCol().doc(), { restaurant_id: restaurantId, withdrawal_id: ref.id, action: "requested", at });
    tx.set(db().collection("financial_notifications").doc(), { restaurant_id: restaurantId, type: "withdrawal_requested", withdrawal_id: ref.id, created_at: at, read_at: null });
    return { id: ref.id, ...withdrawal };
  });
}

export async function decideWithdrawal(id: string, adminUid: string, decision: "approve" | "reject", reason?: string): Promise<void> {
  if (decision === "reject" && !reason?.trim()) throw new Error("Informe o motivo da reprovação.");
  const at = new Date().toISOString();
  await db().runTransaction(async (tx) => {
    const ref = withdrawalCol().doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Solicitação de saque não encontrada.");
    const item = snap.data() as WithdrawalRequest;
    if (item.status !== "pending_approval") throw new Error("Esta solicitação já foi analisada.");
    const balRef = balanceDoc(item.restaurant_id);
    if (decision === "approve") {
      tx.update(ref, { status: "approved" as WithdrawalStatus, approved_at: at, approved_by: adminUid });
      tx.set(auditCol().doc(), { restaurant_id: item.restaurant_id, withdrawal_id: id, action: "approved", admin_uid: adminUid, at });
      tx.set(db().collection("financial_notifications").doc(), { restaurant_id: item.restaurant_id, type: "withdrawal_approved", withdrawal_id: id, created_at: at, read_at: null });
    } else {
      tx.update(ref, { status: "rejected" as WithdrawalStatus, rejected_at: at, rejection_reason: reason!.trim(), approved_by: adminUid });
      tx.set(balRef, { reserved_cents: FieldValue.increment(-item.amount_cents), available_cents: FieldValue.increment(item.amount_cents), active_withdrawal_id: FieldValue.delete(), updated_at: at }, { merge: true });
      tx.set(ledgerCol().doc(), { restaurant_id: item.restaurant_id, payout_id: id, type: "ajuste" as LedgerEntryType, amount_cents: item.amount_cents, currency: "BRL", description: `Saque reprovado: ${reason!.trim()}`, created_at: at });
      tx.set(auditCol().doc(), { restaurant_id: item.restaurant_id, withdrawal_id: id, action: "rejected", admin_uid: adminUid, reason: reason!.trim(), at });
      tx.set(db().collection("financial_notifications").doc(), { restaurant_id: item.restaurant_id, type: "withdrawal_rejected", withdrawal_id: id, reason: reason!.trim(), created_at: at, read_at: null });
    }
  });
}

export async function payWithdrawal(id: string, adminUid: string, proof: { transferTransactionId?: string; paymentProofReference?: string }): Promise<void> {
  if (!proof.transferTransactionId && !proof.paymentProofReference) throw new Error("Informe o identificador da transferência ou o comprovante.");
  const at = new Date().toISOString();
  await db().runTransaction(async (tx) => {
    const ref = withdrawalCol().doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Solicitação de saque não encontrada.");
    const item = snap.data() as WithdrawalRequest;
    if (item.status === "paid") return;
    if (item.status !== "approved") throw new Error("O saque precisa ser aprovado antes do pagamento.");
    // Só o comprovante informado: o Firestore recusa campo undefined (basta um dos dois).
    tx.update(ref, {
      status: "paid" as WithdrawalStatus,
      paid_at: at,
      approved_by: adminUid,
      ...(proof.transferTransactionId ? { transfer_transaction_id: proof.transferTransactionId } : {}),
      ...(proof.paymentProofReference ? { payment_proof_reference: proof.paymentProofReference } : {}),
    });
    tx.set(balanceDoc(item.restaurant_id), { reserved_cents: FieldValue.increment(-item.amount_cents), paid_out_cents: FieldValue.increment(item.amount_cents), active_withdrawal_id: FieldValue.delete(), updated_at: at }, { merge: true });
    tx.set(ledgerCol().doc(), { restaurant_id: item.restaurant_id, payout_id: id, type: "repasse" as LedgerEntryType, amount_cents: -item.amount_cents, currency: "BRL", description: "Saque pago", created_at: at });
    tx.set(auditCol().doc(), { restaurant_id: item.restaurant_id, withdrawal_id: id, action: "paid", admin_uid: adminUid, at });
    tx.set(db().collection("financial_notifications").doc(), { restaurant_id: item.restaurant_id, type: "withdrawal_paid", withdrawal_id: id, created_at: at, read_at: null });
  });
}

// ─── Consultas ────────────────────────────────────────────────────────────

export async function getRestaurantBalance(restaurantId: string): Promise<RestaurantBalance> {
  const snap = await balanceDoc(restaurantId).get();
  if (!snap.exists) {
    return {
      restaurant_id: restaurantId,
      pending_cents: 0,
      available_cents: 0,
      reserved_cents: 0,
      paid_out_cents: 0,
      updated_at: new Date().toISOString(),
    };
  }
  return snap.data() as RestaurantBalance;
}

export async function listTransactions(
  options: {
    restaurant_id?: string;
    payment_status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<FinancialTransaction[]> {
  let q = txCol().orderBy("created_at", "desc") as FirebaseFirestore.Query;
  if (options.restaurant_id) q = q.where("restaurant_id", "==", options.restaurant_id);
  if (options.payment_status) q = q.where("payment_status", "==", options.payment_status);
  if (options.from) q = q.where("created_at", ">=", options.from);
  if (options.to) q = q.where("created_at", "<=", options.to);
  q = q.limit(options.limit ?? 50);

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinancialTransaction, "id">) }));
}

export async function listPayouts(
  options: { restaurant_id?: string; status?: PayoutStatus; limit?: number } = {},
): Promise<Payout[]> {
  let q = payoutCol().orderBy("created_at", "desc") as FirebaseFirestore.Query;
  if (options.restaurant_id) q = q.where("restaurant_id", "==", options.restaurant_id);
  if (options.status) q = q.where("status", "==", options.status);
  q = q.limit(options.limit ?? 50);

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Payout, "id">) }));
}

export async function listWithdrawals(options: { restaurant_id?: string; limit?: number } = {}): Promise<WithdrawalRequest[]> {
  let query = withdrawalCol().orderBy("requested_at", "desc") as FirebaseFirestore.Query;
  if (options.restaurant_id) query = query.where("restaurant_id", "==", options.restaurant_id);
  const snap = await query.limit(options.limit ?? 50).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<WithdrawalRequest, "id">) }));
}

// ─── Sumário financeiro consolidado ───────────────────────────────────────

export async function getFinancialSummary(options: { from?: string; to?: string; restaurant_id?: string } = {}): Promise<FinancialSummary> {
  let q = txCol() as FirebaseFirestore.Query;
  if (options.restaurant_id) q = q.where("restaurant_id", "==", options.restaurant_id);
  if (options.from) q = q.where("created_at", ">=", options.from);
  if (options.to) q = q.where("created_at", "<=", options.to);
  q = q.limit(5000);

  const snap = await q.get();
  // A conta demonstrativa (registros is_demo) só aparece no próprio painel dela, nunca nos totais da plataforma.
  const transactions = snap.docs.map((d) => d.data() as FinancialTransaction & { is_demo?: boolean }).filter((t) => options.restaurant_id || !t.is_demo);

  let gross = 0, approved = 0, gatewayFees = 0, kardapRev = 0, restaurantTotal = 0, chargebacks = 0;
  let count = 0;

  for (const t of transactions) {
    gross += t.gross_amount_cents;
    count++;
    if (t.payment_status === "aprovado" || t.payment_status === "estornado" || t.payment_status === "chargeback") {
      if (t.payment_status === "aprovado") {
        approved += t.gross_amount_cents;
        gatewayFees += t.gateway_fee_cents;
        kardapRev += t.kardap_fee_cents;
        restaurantTotal += t.restaurant_net_cents;
      }
      if (t.payment_status === "estornado" || t.payment_status === "chargeback") {
        chargebacks += t.gross_amount_cents;
      }
    }
  }

  // Saldos agregados
  let availableTotal = 0, pendingTotal = 0, completedPayouts = 0;

  const balSnaps = await db().collection("restaurant_balances").get();
  for (const doc of balSnaps.docs) {
    const b = doc.data() as RestaurantBalance & { is_demo?: boolean };
    if (options.restaurant_id && b.restaurant_id !== options.restaurant_id) continue;
    if (!options.restaurant_id && b.is_demo) continue;
    availableTotal += b.available_cents;
    pendingTotal += b.pending_cents;
    completedPayouts += b.paid_out_cents;
  }

  return {
    gross_revenue_cents: gross,
    approved_payments_cents: approved,
    gateway_fees_cents: gatewayFees,
    kardap_revenue_cents: kardapRev,
    restaurant_total_cents: restaurantTotal,
    available_for_payout_cents: availableTotal,
    pending_payout_cents: pendingTotal,
    completed_payouts_cents: completedPayouts,
    chargebacks_cents: chargebacks,
    unreconciled_cents: 0,
    transaction_count: count,
    period_start: options.from,
    period_end: options.to,
  };
}

export async function getRestaurantFinancialRows(): Promise<RestaurantFinancialRow[]> {
  const [txSnap, balSnap, restSnap] = await Promise.all([
    txCol().where("payment_status", "==", "aprovado").limit(5000).get(),
    db().collection("restaurant_balances").get(),
    db().collection("restaurantes").select("name").get(),
  ]);

  const nameMap: Record<string, string> = {};
  for (const d of restSnap.docs) nameMap[d.id] = (d.data().name as string) || d.id;

  const balMap: Record<string, RestaurantBalance> = {};
  for (const d of balSnap.docs) balMap[d.id] = d.data() as RestaurantBalance;

  const rows: Record<string, RestaurantFinancialRow> = {};
  for (const d of txSnap.docs) {
    const t = d.data() as FinancialTransaction & { is_demo?: boolean };
    if (t.is_demo) continue;
    if (!rows[t.restaurant_id]) {
      rows[t.restaurant_id] = {
        restaurant_id: t.restaurant_id,
        restaurant_name: nameMap[t.restaurant_id] || t.restaurant_id,
        approved_count: 0,
        gross_cents: 0,
        gateway_fee_cents: 0,
        kardap_fee_cents: 0,
        restaurant_net_cents: 0,
        paid_out_cents: balMap[t.restaurant_id]?.paid_out_cents ?? 0,
        pending_cents: balMap[t.restaurant_id]?.pending_cents ?? 0,
        available_cents: balMap[t.restaurant_id]?.available_cents ?? 0,
      };
    }
    rows[t.restaurant_id].approved_count++;
    rows[t.restaurant_id].gross_cents += t.gross_amount_cents;
    rows[t.restaurant_id].gateway_fee_cents += t.gateway_fee_cents;
    rows[t.restaurant_id].kardap_fee_cents += t.kardap_fee_cents;
    rows[t.restaurant_id].restaurant_net_cents += t.restaurant_net_cents;
  }

  // Última data de repasse
  const payoutSnap = await payoutCol().where("status", "==", "concluido").orderBy("completed_at", "desc").limit(500).get();
  const lastPayoutMap: Record<string, string> = {};
  for (const d of payoutSnap.docs) {
    const p = d.data() as Payout;
    if (!lastPayoutMap[p.restaurant_id]) lastPayoutMap[p.restaurant_id] = p.completed_at || "";
  }
  for (const row of Object.values(rows)) {
    row.last_payout_at = lastPayoutMap[row.restaurant_id];
  }

  return Object.values(rows).sort((a, b) => b.gross_cents - a.gross_cents);
}

// ─── Processamento de webhook ─────────────────────────────────────────────

export async function processPaymentWebhook(payload: {
  event: string;
  payment_id: string;
  order_id: string;
  restaurant_id: string;
  gateway: string;
  gross_amount_cents: number;
  gateway_fee_cents?: number;
  status: "aprovado" | "recusado" | "cancelado" | "estornado" | "chargeback" | "pendente";
  timestamp: string;
}): Promise<{ action: string; transaction_id?: string }> {
  const { event, payment_id, order_id, restaurant_id, gateway, gross_amount_cents, gateway_fee_cents, status } = payload;

  if (event === "payment.approved" || status === "aprovado") {
    const tx = await createFinancialTransaction({
      restaurant_id,
      order_id,
      payment_id,
      gateway,
      gross_amount_cents,
      gateway_fee_cents_actual: gateway_fee_cents,
      payment_status: "aprovado",
      idempotency_key: `${gateway}:${payment_id}`,
    });
    return { action: "transaction_created", transaction_id: tx.id };
  }

  if (event === "payment.refunded" || event === "payment.chargeback" || status === "estornado" || status === "chargeback") {
    // Encontra transação existente e estorna
    const snap = await txCol().where("order_id", "==", order_id).where("gateway", "==", gateway).limit(1).get();
    if (!snap.empty) {
      await reverseTransaction(snap.docs[0].id, `Estorno via webhook ${gateway}`, "webhook");
      return { action: "transaction_reversed", transaction_id: snap.docs[0].id };
    }
  }

  if (event === "payment.settled" || event === "payment.liquidated") {
    const snap = await txCol().where("order_id", "==", order_id).where("gateway", "==", gateway).limit(1).get();
    if (!snap.empty) {
      await settleTransaction(snap.docs[0].id);
      return { action: "transaction_settled", transaction_id: snap.docs[0].id };
    }
  }

  return { action: "ignored" };
}
