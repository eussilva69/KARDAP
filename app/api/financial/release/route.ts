import type { NextRequest } from "next/server";
import { errorResponse, json, preflight } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { releaseEligibleTransactions } from "@/lib/financial/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.FINANCIAL_RELEASE_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new BillingError("forbidden", 403, "Tarefa não autorizada.");
    const released = await releaseEligibleTransactions();
    return json(req, { released });
  } catch (error) {
    return errorResponse(req, "release financial balances", error);
  }
}
