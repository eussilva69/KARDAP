import type { NextRequest } from "next/server";
import { json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { adminAuth } from "@/lib/firebase-admin";
import { isAdminUid as isSystemAdmin } from "@/lib/admin/server";
import { getFinancialSettings, saveFinancialSettings } from "@/lib/financial/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

async function requireAdmin(req: NextRequest): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Não autenticado."), { status: 401 });
  const decoded = await adminAuth().verifyIdToken(token);
  const ok = await isSystemAdmin(decoded.uid);
  if (!ok) throw Object.assign(new Error("Acesso restrito."), { status: 403 });
  return decoded.uid;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const settings = await getFinancialSettings();
    return json(req, { settings });
  } catch (error) {
    return errorResponse(req, "financial settings", error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminUid = await requireAdmin(req);
    const body = await readJson(req);

    const patch: Parameters<typeof saveFinancialSettings>[0] = {};
    if (typeof body.default_gateway_fee_percent === "number") {
      if (body.default_gateway_fee_percent < 0 || body.default_gateway_fee_percent > 50) throw new Error("Taxa do gateway deve estar entre 0 e 50%.");
      patch.default_gateway_fee_percent = body.default_gateway_fee_percent;
    }
    if (typeof body.default_kardap_fee_percent === "number") {
      if (body.default_kardap_fee_percent < 0 || body.default_kardap_fee_percent > 50) throw new Error("Comissão do KARDAP deve estar entre 0 e 50%.");
      patch.default_kardap_fee_percent = body.default_kardap_fee_percent;
    }
    if (typeof body.settlement_delay_days === "number") {
      patch.settlement_delay_days = Math.max(0, Math.round(body.settlement_delay_days));
    }

    const settings = await saveFinancialSettings(patch, adminUid);
    return json(req, { settings });
  } catch (error) {
    return errorResponse(req, "save financial settings", error);
  }
}
