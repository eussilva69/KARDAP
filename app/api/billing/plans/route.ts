import { NextResponse } from "next/server";
import { publicPlans } from "@/lib/billing/plans";

// Rota pública: lista os planos para a tela de contratação.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ plans: publicPlans() });
}
