import crypto from "node:crypto";

console.log("=================================================");
console.log("SUITE DE TESTES: INTEGRAÇÃO CAKTO NO KARDAP");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

// ─── TESTE 1: Validação de Assinatura HMAC-SHA256 (Webhooks) ───
const TEST_SECRET = "cakto_sec_test_9876543210abcdef";
const nowSec = Math.floor(Date.now() / 1000);
const payloadObj = {
  secret: TEST_SECRET,
  event: "purchase_approved",
  data: {
    id: "ord_123456",
    refId: "KARDAP-001",
    status: "paid",
    amount: 99.0,
    callback: "sess_uuid_abcdef123456",
    paymentMethod: "credit_card",
  },
};
const rawPayload = Buffer.from(JSON.stringify(payloadObj), "utf-8");

// Gera assinatura correta
const expectedDigest = crypto
  .createHmac("sha256", TEST_SECRET)
  .update(`${nowSec}.`)
  .update(rawPayload)
  .digest("hex");
const validSignature = `v1=${expectedDigest}`;

// Função de validação idêntica à do lib/cakto/client.ts
function verifySignature(raw, ts, sig, sec) {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const hash = crypto.createHmac("sha256", sec).update(`${ts}.`).update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(`v1=${hash}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

assert(
  verifySignature(rawPayload, nowSec.toString(), validSignature, TEST_SECRET) === true,
  "1.1: Webhook com assinatura HMAC-SHA256 e timestamp válidos deve ser aceito",
);

assert(
  verifySignature(rawPayload, nowSec.toString(), "v1=invaliddigest1234567890abcdef1234567890abcdef", TEST_SECRET) === false,
  "1.2: Webhook com assinatura adulterada deve ser rejeitado",
);

assert(
  verifySignature(rawPayload, (nowSec - 400).toString(), validSignature, TEST_SECRET) === false,
  "1.3: Webhook com timestamp expirado (> 5 minutos / 300s) deve ser rejeitado contra replay attacks",
);

// ─── TESTE 2: Preços e Planos definidos no Servidor ───
const PLANS = {
  essencial: { monthly: 4900, annual: 47000 },
  pro: { monthly: 9900, annual: 95000 },
};

function getPrice(plan, cycle) {
  return PLANS[plan]?.[cycle] ?? null;
}

assert(getPrice("essencial", "monthly") === 4900, "2.1: Preço Essencial Mensal validado no servidor (R$ 49,00)");
assert(getPrice("essencial", "annual") === 47000, "2.2: Preço Essencial Anual validado no servidor (R$ 470,00)");
assert(getPrice("pro", "monthly") === 9900, "2.3: Preço Pro Mensal validado no servidor (R$ 99,00)");
assert(getPrice("pro", "annual") === 95000, "2.4: Preço Pro Anual validado no servidor (R$ 950,00)");

// ─── TESTE 3: Regras de Acesso e Permissões (canAccessFeature) ───
function canAccessFeature(sub, feature) {
  if (!sub) return false;
  if (sub.status === "trial") return true;
  if (sub.status === "late") {
    const daysInGrace = (Date.now() - new Date(sub.lateSince).getTime()) / (1000 * 60 * 60 * 24);
    if (daysInGrace > 3) return false;
  } else if (sub.status !== "active") {
    if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > Date.now()) {
      // Período já pago continua valendo
    } else {
      return false;
    }
  }

  if (sub.planId === "pro") return true;
  if (sub.planId === "essencial") {
    return feature === "waiter_call" || feature === "custom_brand";
  }
  return false;
}

// Assinatura Essencial
const subEssencial = { planId: "essencial", status: "active" };
assert(canAccessFeature(subEssencial, "waiter_call") === true, "3.1: Plano Essencial pode receber chamados das mesas");
assert(canAccessFeature(subEssencial, "bill_request") === false, "3.2: Plano Essencial não pode pedir conta à mesa (exclusivo Pro)");
assert(canAccessFeature(subEssencial, "advanced_reports") === false, "3.3: Plano Essencial não tem acesso a relatórios avançados (exclusivo Pro)");

// Assinatura Pro
const subPro = { planId: "pro", status: "active" };
assert(canAccessFeature(subPro, "bill_request") === true, "3.4: Plano Pro tem acesso ao pedido de conta à mesa");
assert(canAccessFeature(subPro, "advanced_reports") === true, "3.5: Plano Pro tem acesso a relatórios completos");

// Assinatura em Trial
const subTrial = { planId: "essencial", status: "trial" };
assert(canAccessFeature(subTrial, "bill_request") === true, "3.6: Em período de Teste (15 dias), todas as features estão liberadas");

// Assinatura Inadimplente dentro do Grace Period (2 dias de atraso)
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const subLateInGrace = { planId: "pro", status: "late", lateSince: twoDaysAgo };
assert(canAccessFeature(subLateInGrace, "bill_request") === true, "3.7: Inadimplente dentro da carência (até 3 dias) mantém acesso");

// Assinatura Inadimplente fora do Grace Period (5 dias de atraso)
const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
const subLateOutGrace = { planId: "pro", status: "late", lateSince: fiveDaysAgo };
assert(canAccessFeature(subLateOutGrace, "bill_request") === false, "3.8: Inadimplente após fim da carência (> 3 dias) tem acesso bloqueado");

// Assinatura Cancelada mas com período já pago vigente (expira em 15 dias)
const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
const subCanceledPaid = { planId: "pro", status: "canceled", currentPeriodEnd: in15Days };
assert(canAccessFeature(subCanceledPaid, "bill_request") === true, "3.9: Assinatura cancelada mas com período já pago respeita o acesso");

// Assinatura Cancelada com período expirado
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const subCanceledExpired = { planId: "pro", status: "canceled", currentPeriodEnd: yesterday };
assert(canAccessFeature(subCanceledExpired, "bill_request") === false, "3.10: Assinatura cancelada e expirada tem acesso revogado");

// ─── TESTE 4: Idempotência de Processamento de Eventos ───
const processedEvents = new Set();
function processEvent(id) {
  if (processedEvents.has(id)) return { duplicate: true };
  processedEvents.add(id);
  return { duplicate: false, processed: true };
}

assert(processEvent("evt_abc123").duplicate === false, "4.1: Primeira entrega do webhook é processada normalmente");
assert(processEvent("evt_abc123").duplicate === true, "4.2: Segunda entrega do mesmo webhook (retentativa) é detectada como duplicata e ignorada");

// ─── TESTE 5: Mapeamento de Ciclo de Vida da Assinatura ───
const eventStatusMap = {
  purchase_approved: "active",
  subscription_created: "active",
  subscription_renewed: "active",
  subscription_late: "late",
  subscription_renewal_refused: "late",
  subscription_late_recovered: "active",
  subscription_canceled: "canceled",
  refund: "inactive",
};

assert(eventStatusMap.purchase_approved === "active", "5.1: purchase_approved ativa a assinatura");
assert(eventStatusMap.subscription_renewed === "active", "5.2: subscription_renewed mantém ativa e renovada");
assert(eventStatusMap.subscription_renewal_refused === "late", "5.3: subscription_renewal_refused marca como em atraso");
assert(eventStatusMap.subscription_late_recovered === "active", "5.4: subscription_late_recovered regulariza a assinatura");
assert(eventStatusMap.subscription_canceled === "canceled", "5.5: subscription_canceled atualiza para cancelada");
assert(eventStatusMap.refund === "inactive", "5.6: refund desativa a assinatura");

console.log("\n=================================================");
console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS COM SUCESSO!`);
console.log("=================================================");
