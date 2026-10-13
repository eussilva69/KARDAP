import { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE } from "@/lib/sso/config";
import { issueCsrf, withCors } from "@/lib/sso/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Entrega o token anti-CSRF (cookie kardap_csrf). As rotas de sessão exigem o mesmo valor no cabeçalho x-csrf-token. */
export function GET(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  issueCsrf(res, req.cookies.get(CSRF_COOKIE)?.value);
  return withCors(req, res);
}

export function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
