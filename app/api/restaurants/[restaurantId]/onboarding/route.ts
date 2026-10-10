import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "cardapio";

export async function PUT(request: NextRequest, { params }: { params: { restaurantId: string } }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const user = await adminAuth().verifyIdToken(token);
    const db = adminDb();
    const restaurant = db.collection("restaurantes").doc(params.restaurantId);
    const member = await restaurant.collection("membros").doc(user.uid).get();
    if (!member.exists || member.data()?.role !== "owner") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
    const base = slugify(name);
    let slug = base;
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const existing = await db.collection("restaurantes").where("slug", "==", slug).limit(1).get();
      if (existing.empty || existing.docs[0].id === restaurant.id) break;
      slug = `${base}-${suffix}`;
    }
    await restaurant.update({ name, slug, onboarding: { ...(body.onboarding || {}), completed: true, currentStep: 5, completedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    return NextResponse.json({ slug });
  } catch {
    return NextResponse.json({ error: "Não foi possível concluir o onboarding" }, { status: 500 });
  }
}
