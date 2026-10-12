"use client";

// ROTA TEMPORÁRIA DE VERIFICAÇÃO VISUAL (dados fictícios). Remover antes de publicar.
import { useEffect, useState } from "react";
import Dashboard from "@/components/dashboard/dashboard";
import PublicMenu from "@/components/menu/public-menu";
import { Toaster, type ToastState } from "@/components/ui/toast";
import { paletteFromPreset, presetById } from "@/lib/palette";
import type { AccountInfo, Brand, RestaurantSettings } from "@/components/dashboard/types";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=70`;

const categories = [
  { id: "c1", name: "Entradas", description: "Para dividir na mesa", order: 0, active: true },
  { id: "c2", name: "Pizzas", description: "", order: 1, active: true },
  { id: "c4", name: "Bebidas", description: "", order: 2, active: true },
];
const foods = [
  { id: "p1", name: "Pizza Margherita", categoryId: "c2", category: "Pizzas", description: "Molho de tomate italiano, muçarela de búfala e manjericão fresco.", priceCents: 4990, image: U("photo-1574071318508-1cdbab80d002"), available: true },
  { id: "p3", name: "Steak na tábua", categoryId: "c1", category: "Entradas", description: "Fatiado na hora, com farofa crocante e vinagrete.", priceCents: 7990, image: U("photo-1544025162-d76694265947"), available: true },
  { id: "p4", name: "Coca-Cola 350 ml", categoryId: "c4", category: "Bebidas", description: "", priceCents: 890, available: true },
];
const calls = [
  { _key: "sub:1", _source: "sub" as const, _id: "1", table: "Mesa 04", type: "Fazer um pedido", status: "ativo", time: "", createdAt: ago(6) },
  { _key: "sub:3", _source: "sub" as const, _id: "3", table: "Varanda 2", type: "Tirar dúvida sobre o cardápio", status: "andamento", time: "", createdAt: ago(9) },
];
const tables = Array.from({ length: 6 }, (_, i) => `Mesa ${String(i + 1).padStart(2, "0")}`);
const account: AccountInfo = { subscription: null, createdAt: new Date(Date.now() - 4 * 86400000).toISOString(), suspended: false, suspendedReason: "" };

export default function Preview({ params, searchParams }: { params: { view?: string[] }; searchParams: { pal?: string; panel?: string } }) {
  const view = params.view || [];
  const preset = presetById(searchParams.pal);
  const initialPalette = preset && preset.id !== "kardap" ? paletteFromPreset(preset, searchParams.panel !== "0") : null;
  const [toast, setToast] = useState<ToastState>(null);
  const [brand, setBrand] = useState<Brand>({ logo: "", cover: "/brand/salao-noite.jpg", palette: initialPalette, customPalette: null });
  const [settings, setSettings] = useState<RestaurantSettings>({ waiter: true, bill: true, google: true, sound: false, googleReviewUrl: "https://g.page/r/exemplo/review" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const notify = (message: string, tone: "success" | "error" = "success", action?: any) => setToast({ id: Date.now(), message, tone, action });

  if (view[0] === "menu")
    return (
      <PublicMenu
        status="ready"
        slow={false}
        onRetry={() => undefined}
        productsLoaded
        restaurantId="preview"
        table="Mesa 07"
        brand={brand}
        settings={settings}
        foods={foods}
        categories={categories}
        restaurantName="Cantina Bella Vista"
        billAllowed
        suspended={false}
      />
    );

  return (
    <>
      <Dashboard
        path={"/dashboard" + (view[1] ? `/${view[1]}` : "")}
        calls={calls}
        advanceCall={() => undefined}
        chamadosHasMore={false}
        chamadosLoading={false}
        chamadosError=""
        loadMoreChamados={() => undefined}
        notify={notify}
        brand={brand}
        setBrand={setBrand}
        restaurantName="Cantina Bella Vista"
        settings={settings}
        setSettings={setSettings}
        foods={foods}
        categories={categories}
        tables={tables}
        tableTokens={{}}
        pendingTables={[]}
        loaded={{ products: true, categories: true, tables: true }}
        loadErrors={{}}
        onRetry={() => undefined}
        account={account}
      />
      <Toaster toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
