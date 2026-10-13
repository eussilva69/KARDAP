import Link from "next/link";

export default function Inicio() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>PDV</h1>
      <Link href="/caixa">Abrir o caixa</Link>
    </main>
  );
}
