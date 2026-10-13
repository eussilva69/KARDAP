"use client";

// Página de teste do PDV (scripts/e2e-sso.mjs). Usa o Firebase do navegador conectado pela sessão
// compartilhada para operações reais, sujeitas às regras do repositório: leituras restritas à equipe
// no Firestore e envio/exclusão de arquivo no Storage.
import { useEffect, useState } from "react";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, deleteObject, getMetadata, getStorage, ref, uploadBytes } from "firebase/storage";
import { usePdvAuth } from "@/components/pdv-auth-provider";
import { pdvFirebaseApp } from "@/lib/sso/pdv-firebase";

let connected = false;

export default function Caixa() {
  const { user, restaurants, logout } = usePdvAuth();
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const app = pdvFirebaseApp();
    const db = getFirestore(app);
    const storage = getStorage(app);
    if (!connected) {
      connected = true;
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
    }
    (async () => {
      const rid = restaurants[0]?.id;
      const out: Record<string, unknown> = { uid: user.uid, rid, app: (await user.getIdTokenResult()).claims.kardapApp };
      out.member = (await getDoc(doc(db, "restaurantes", rid, "membros", user.uid))).exists();
      out.videos = (await getDocs(collection(db, "restaurantes", rid, "videos"))).size;
      const file = ref(storage, `restaurantes/${rid}/produtos/imagens/pdv-sso-${Date.now()}.webp`);
      await uploadBytes(file, new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]), { contentType: "image/webp" });
      out.uploaded = (await getMetadata(file)).size;
      await deleteObject(file);
      out.deleted = true;
      setResult(out);
    })().catch((error) => setResult({ error: String(error?.code || error) }));
  }, [user, restaurants]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Caixa</h1>
      <p id="pdv-uid">{user.uid}</p>
      <p id="pdv-restaurants">{restaurants.map((r) => r.name).join(", ")}</p>
      <pre id="pdv-result">{result ? JSON.stringify(result) : ""}</pre>
      <button type="button" id="pdv-logout" onClick={() => logout()}>
        Sair
      </button>
      <button type="button" id="pdv-logout-all" onClick={() => logout(true)}>
        Sair de todos os aparelhos
      </button>
    </main>
  );
}
