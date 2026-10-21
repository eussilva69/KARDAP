type Item = { value: unknown; expiresAt: number };
const cache = new Map<string, Item>();

export function readPrivateCache<T>(key: string): { value: T; stale: boolean } | null {
  const item = cache.get(key);
  if (!item) return null;
  return { value: item.value as T, stale: item.expiresAt <= Date.now() };
}

export function writePrivateCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearPrivateMemoryCache() {
  cache.clear();
}
