"use client";

import { recordFirestoreMetric } from "./firestore-observability.ts";

type Subscriber<T> = { data: (value: T) => void; error: (error: Error) => void };
type Entry<T> = {
  subscribers: Set<Subscriber<T>>;
  stop: () => void;
  latest?: T;
  hasLatest: boolean;
  closeTimer?: ReturnType<typeof setTimeout>;
};

const entries = new Map<string, Entry<unknown>>();
const NAVIGATION_GRACE_MS = 5_000;

/** Compartilha um único onSnapshot por chave e reapresenta o último valor durante navegações curtas. */
export function subscribeShared<T>(key: string, start: (emit: (value: T, documents?: number) => void, fail: (error: Error) => void) => () => void, data: (value: T) => void, error: (error: Error) => void): () => void {
  let entry = entries.get(key) as Entry<T> | undefined;
  const subscriber = { data, error };
  if (!entry) {
    entry = { subscribers: new Set(), stop: () => undefined, hasLatest: false };
    entries.set(key, entry as Entry<unknown>);
    recordFirestoreMetric("start");
    entry.stop = start(
      (value, documents = 1) => {
        const current = entries.get(key) as Entry<T> | undefined;
        if (!current) return;
        current.latest = value;
        current.hasLatest = true;
        recordFirestoreMetric("snapshot", documents);
        current.subscribers.forEach((item) => item.data(value));
      },
      (cause) => {
        const current = entries.get(key) as Entry<T> | undefined;
        current?.subscribers.forEach((item) => item.error(cause));
      },
    );
  } else {
    recordFirestoreMetric("reuse");
    if (entry.closeTimer) clearTimeout(entry.closeTimer);
  }
  entry.subscribers.add(subscriber);
  if (entry.hasLatest) queueMicrotask(() => {
    if (entry?.subscribers.has(subscriber)) subscriber.data(entry.latest as T);
  });

  return () => {
    const current = entries.get(key) as Entry<T> | undefined;
    if (!current) return;
    current.subscribers.delete(subscriber);
    if (current.subscribers.size) return;
    current.closeTimer = setTimeout(() => {
      const idle = entries.get(key) as Entry<T> | undefined;
      if (!idle || idle.subscribers.size) return;
      idle.stop();
      entries.delete(key);
      recordFirestoreMetric("stop");
    }, NAVIGATION_GRACE_MS);
  };
}

export function stopAllSharedListeners() {
  entries.forEach((entry) => {
    if (entry.closeTimer) clearTimeout(entry.closeTimer);
    entry.stop();
    recordFirestoreMetric("stop");
  });
  entries.clear();
}
