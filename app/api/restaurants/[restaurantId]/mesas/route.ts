import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json, readJson } from "@/lib/billing/http";
import { checkPlanLimit, createTables, requireManager } from "@/lib/billing/server";
import { rateLimit } from "@/lib/sso/server";

/**
 * Criação de mesas, sempre pelo servidor: o limite do plano é conferido na mesma transação que grava a mesa.
 * POST { name? } cria uma mesa (próximo número) · POST { quantity } cria as mesas 1..N da configuração inicial.
 * GET informa o uso (mesas cadastradas e limite).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    await requireManager(params.restaurantId, caller.uid, "settings");
    return json(req, await checkPlanLimit(params.restaurantId, "tables", 1));
  } catch (error) {
    return errorResponse(req, "mesas", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    rateLimit(req, "billing-tables", 60, 60_000, caller.uid);
    const tables = await createTables(params.restaurantId, caller.uid, {
      name: typeof body.name === "string" ? body.name : undefined,
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
    });
    return json(req, { tables }, 201);
  } catch (error) {
    return errorResponse(req, "mesas", error);
  }
}
