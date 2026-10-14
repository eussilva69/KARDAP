/**
 * Reels do cardápio (docs/REELS.md): curtidas sem conta, pratos salvos (no celular ou na conta do cliente)
 * e links de compartilhamento.
 *
 * Curtida: cada visitante recebe uma identidade anônima do Firebase Auth no primeiro toque (sem cadastro).
 * O documento restaurantes/{rid}/curtidas/{produto}_{uid} e o contador `likes` do produto mudam no mesmo lote;
 * as regras do Firestore só aceitam +1/−1 casado com a criação/exclusão da curtida da própria pessoa.
 *
 * Salvos: sempre neste celular (localStorage, sem conta) e, para quem entra numa conta de cliente, também em
 * clientes/{uid}/salvos. Ao entrar, o que estava salvo no celular sobe para a conta. A identidade anônima vira a
 * conta (mesmo uid), então as curtidas também são mantidas.
 */
import { collection, deleteDoc, doc, getDocs, increment, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import type { Auth, User } from "firebase/auth";
import { getDb } from "./firebase";
import { withTimeout, withWriteTimeout } from "./async";

export type SavedItem = {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  productId: string;
  name: string;
  priceCents: number;
  image: string;
  savedAt: number;
};

export type Customer = { uid: string; email: string | null; name: string | null; anonymous: boolean };

const LOCAL_SAVED = "kardap-salvos";
const localLikesKey = (restaurantId: string) => `kardap-curtidas-${restaurantId}`;

// ───────────────────────── Identidade ─────────────────────────

async function loadAuth(): Promise<{ auth: Auth; sdk: typeof import("firebase/auth") }> {
  const [{ getFirebaseAuth }, sdk] = await Promise.all([import("./auth"), import("firebase/auth")]);
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return { auth, sdk };
}

const toCustomer = (user: User | null): Customer | null =>
  user ? { uid: user.uid, email: user.email, name: user.displayName, anonymous: user.isAnonymous } : null;

/** Quem está usando o cardápio agora (sem criar ninguém). */
export async function currentCustomer(): Promise<Customer | null> {
  const { auth } = await loadAuth();
  return toCustomer(auth.currentUser);
}

/** Identidade para curtir: a conta, se houver, ou uma identidade anônima criada agora. */
async function identity(): Promise<User> {
  const { auth, sdk } = await loadAuth();
  if (auth.currentUser) return auth.currentUser;
  return (await withTimeout(sdk.signInAnonymously(auth), 15000)).user;
}

// ───────────────────────── Curtidas ─────────────────────────

export function localLikes(restaurantId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(localLikesKey(restaurantId)) || "[]"));
  } catch {
    return new Set();
  }
}

function storeLocalLikes(restaurantId: string, likes: Set<string>) {
  try {
    localStorage.setItem(localLikesKey(restaurantId), JSON.stringify(Array.from(likes).slice(-500)));
  } catch {}
}

/** Curtidas desta pessoa neste restaurante, direto do servidor (vazio se ainda não há identidade). */
export async function fetchMyLikes(restaurantId: string): Promise<Set<string>> {
  const { auth } = await loadAuth();
  const user = auth.currentUser;
  if (!user) return new Set();
  const snap = await withTimeout(getDocs(query(collection(getDb(), "restaurantes", restaurantId, "curtidas"), where("uid", "==", user.uid))));
  const likes = new Set(snap.docs.map((d) => String(d.data().productId)));
  storeLocalLikes(restaurantId, likes);
  return likes;
}

/**
 * Curte ou descurte. `onQueued` é chamado assim que o lote entra na fila local do Firestore: a partir daí o
 * contador do produto já aparece atualizado no cardápio aberto (compensação de latência do próprio SDK).
 */
export async function setLike(restaurantId: string, productId: string, liked: boolean, onQueued?: () => void) {
  const user = await identity();
  const db = getDb();
  const like = doc(db, "restaurantes", restaurantId, "curtidas", `${productId}_${user.uid}`);
  const product = doc(db, "restaurantes", restaurantId, "produtos", productId);
  const batch = writeBatch(db);
  if (liked) {
    batch.set(like, { productId, uid: user.uid, createdAt: serverTimestamp() });
    batch.update(product, { likes: increment(1) });
  } else {
    batch.delete(like);
    batch.update(product, { likes: increment(-1) });
  }
  const commit = batch.commit();
  onQueued?.();
  await withWriteTimeout(commit);
  const likes = localLikes(restaurantId);
  if (liked) likes.add(productId);
  else likes.delete(productId);
  storeLocalLikes(restaurantId, likes);
}

// ───────────────────────── Salvos ─────────────────────────

export function localSaved(): SavedItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(LOCAL_SAVED) || "[]");
    return Array.isArray(items) ? items.filter((i) => i && typeof i.productId === "string" && typeof i.restaurantId === "string") : [];
  } catch {
    return [];
  }
}

function storeLocalSaved(items: SavedItem[]) {
  try {
    localStorage.setItem(LOCAL_SAVED, JSON.stringify(items.slice(-300)));
  } catch {}
}

const savedKey = (item: Pick<SavedItem, "restaurantId" | "productId">) => `${item.restaurantId}_${item.productId}`;

/** Lista combinada: o que está no celular e, se houver conta, o que está nela. Mais recentes primeiro. */
export function mergeSaved(...lists: SavedItem[][]): SavedItem[] {
  const map = new Map<string, SavedItem>();
  lists.flat().forEach((item) => {
    const current = map.get(savedKey(item));
    if (!current || item.savedAt > current.savedAt) map.set(savedKey(item), item);
  });
  return Array.from(map.values()).sort((a, b) => b.savedAt - a.savedAt);
}

export async function accountSaved(): Promise<SavedItem[]> {
  const { auth } = await loadAuth();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return [];
  const snap = await withTimeout(getDocs(collection(getDb(), "clientes", user.uid, "salvos")));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      restaurantId: String(data.restaurantId),
      restaurantSlug: String(data.restaurantSlug || ""),
      restaurantName: String(data.restaurantName || ""),
      productId: String(data.productId),
      name: String(data.name || ""),
      priceCents: Number(data.priceCents) || 0,
      image: String(data.image || ""),
      savedAt: Number(data.savedAt) || 0,
    };
  });
}

/**
 * Salva ou remove. Sempre no celular; também na conta, quando há uma conta de cliente.
 * Retorna onde ficou: "conta" ou "aparelho".
 */
export async function setSaved(item: SavedItem, saved: boolean): Promise<"conta" | "aparelho"> {
  const local = localSaved().filter((i) => savedKey(i) !== savedKey(item));
  storeLocalSaved(saved ? [...local, item] : local);
  const { auth } = await loadAuth();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return "aparelho";
  const ref = doc(getDb(), "clientes", user.uid, "salvos", savedKey(item));
  await withWriteTimeout(saved ? setDoc(ref, item) : deleteDoc(ref));
  return "conta";
}

/** Sobe para a conta o que estava salvo só no celular. */
async function syncLocalToAccount(user: User) {
  const items = localSaved();
  if (!items.length) return;
  const db = getDb();
  const batch = writeBatch(db);
  items.slice(-300).forEach((item) => batch.set(doc(db, "clientes", user.uid, "salvos", savedKey(item)), item));
  await withWriteTimeout(batch.commit(), 20000);
}

async function markCustomer(user: User) {
  await withWriteTimeout(setDoc(doc(getDb(), "clientes", user.uid), { tipo: "cliente", email: user.email ?? null, atualizadoEm: serverTimestamp() }, { merge: true }));
  await syncLocalToAccount(user);
}

// ───────────────────────── Conta de cliente ─────────────────────────

/** Cria a conta de cliente. Se já havia identidade anônima (curtidas), ela vira a conta (mesmo uid). */
export async function signUpCustomer(email: string, password: string): Promise<Customer> {
  const { auth, sdk } = await loadAuth();
  const current = auth.currentUser;
  const user =
    current?.isAnonymous
      ? (await withTimeout(sdk.linkWithCredential(current, sdk.EmailAuthProvider.credential(email, password)), 20000)).user
      : (await withTimeout(sdk.createUserWithEmailAndPassword(auth, email, password), 20000)).user;
  await markCustomer(user);
  return toCustomer(user)!;
}

export async function signInCustomer(email: string, password: string): Promise<Customer> {
  const { auth, sdk } = await loadAuth();
  const user = (await withTimeout(sdk.signInWithEmailAndPassword(auth, email, password), 20000)).user;
  await markCustomer(user);
  return toCustomer(user)!;
}

/** Google: vincula à identidade anônima quando dá; se a conta Google já existe, entra nela. */
export async function signInCustomerWithGoogle(): Promise<Customer> {
  const { auth, sdk } = await loadAuth();
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const current = auth.currentUser;
  let user: User;
  if (current?.isAnonymous) {
    try {
      user = (await sdk.linkWithPopup(current, provider)).user;
    } catch (error) {
      const credential = sdk.GoogleAuthProvider.credentialFromError(error as never);
      if ((error as { code?: string }).code !== "auth/credential-already-in-use" || !credential) throw error;
      user = (await sdk.signInWithCredential(auth, credential)).user;
    }
  } else {
    user = (await sdk.signInWithPopup(auth, provider)).user;
  }
  await markCustomer(user);
  return toCustomer(user)!;
}

export async function resetCustomerPassword(email: string) {
  const { auth, sdk } = await loadAuth();
  await withTimeout(sdk.sendPasswordResetEmail(auth, email), 20000);
}

export async function signOutCustomer() {
  const { auth, sdk } = await loadAuth();
  await sdk.signOut(auth);
}

// ───────────────────────── Compartilhar ─────────────────────────

/** Link que abre o cardápio direto no vídeo do prato (sem a mesa de quem compartilhou). */
export function reelUrl(slug: string, productId: string) {
  return `${window.location.origin}/r/${encodeURIComponent(slug)}?reel=${encodeURIComponent(productId)}`;
}

export function shareText(dishName: string, restaurantName: string) {
  return restaurantName ? `${dishName}, no cardápio do ${restaurantName}` : dishName;
}

/** Folha de compartilhamento do celular. "fallback" quando ela não existe ou falha (mostrar as opções próprias). */
export async function shareDish(slug: string, productId: string, dishName: string, restaurantName: string): Promise<"shared" | "cancelled" | "fallback"> {
  const url = reelUrl(slug, productId);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: dishName, text: shareText(dishName, restaurantName), url });
      return "shared";
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return "cancelled";
    }
  }
  return "fallback";
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Navegadores sem a API de área de transferência (ou sem permissão): método antigo.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Mensagens de erro de login/cadastro do cliente, em português. */
export function customerAuthError(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") return "Já existe uma conta com este e-mail. Toque em “Já tenho conta” para entrar.";
  if (code === "auth/invalid-email") return "Confira o e-mail digitado.";
  if (code === "auth/weak-password") return "Use uma senha com pelo menos 6 caracteres.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "E-mail ou senha incorretos.";
  if (code === "auth/missing-password") return "Digite a senha.";
  if (code === "auth/too-many-requests") return "Muitas tentativas. Espere um pouco e tente de novo.";
  if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "A janela do Google foi fechada antes de terminar. Tente de novo ou use e-mail e senha.";
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") return "Esta forma de entrar ainda não está liberada. Tente outra.";
  if (code === "auth/network-request-failed" || code === "timeout") return "Sem conexão. Confira a internet e tente de novo.";
  return "Não foi possível concluir agora. Tente de novo.";
}
