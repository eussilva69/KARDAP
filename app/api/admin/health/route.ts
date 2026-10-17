import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. Env vars present?
  checks.FIREBASE_ADMIN_CREDENTIALS = process.env.FIREBASE_ADMIN_CREDENTIALS ? `set (${process.env.FIREBASE_ADMIN_CREDENTIALS.length} chars)` : "MISSING";
  checks.NEXT_PUBLIC_FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "MISSING";

  // 2. Can we parse credentials?
  try {
    const raw = process.env.FIREBASE_ADMIN_CREDENTIALS?.trim();
    if (raw) {
      const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const parsed = JSON.parse(json);
      checks.credentialsParsed = "ok";
      checks.hasProjectId = String(!!parsed.project_id);
      checks.hasClientEmail = String(!!parsed.client_email);
      checks.hasPrivateKey = String(!!parsed.private_key);
      checks.privateKeyStart = parsed.private_key?.substring(0, 27) || "empty";
    }
  } catch (e: any) {
    checks.credentialsParsed = `FAIL: ${e.message}`;
  }

  // 3. Can we import firebase-admin?
  try {
    const { getApps } = await import("firebase-admin/app");
    checks.firebaseAdminImport = "ok";
    checks.existingApps = String(getApps().length);
  } catch (e: any) {
    checks.firebaseAdminImport = `FAIL: ${e.message}`;
  }

  // 4. Can we initialize?
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const db = adminDb();
    checks.firebaseAdminInit = "ok";
    checks.firestoreProject = (db as any)._settings?.projectId || "unknown";
  } catch (e: any) {
    checks.firebaseAdminInit = `FAIL: ${e.message}`;
  }

  return NextResponse.json(checks);
}
