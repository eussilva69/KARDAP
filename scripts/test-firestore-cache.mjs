import test from "node:test";
import assert from "node:assert/strict";
import { subscribeShared, stopAllSharedListeners } from "../lib/firestore-shared-listener.ts";
import { getFirestoreMetrics, resetFirestoreMetrics } from "../lib/firestore-observability.ts";

test("assinantes com a mesma chave compartilham um listener e recebem replay", async () => {
  resetFirestoreMetrics();
  let starts = 0;
  let stops = 0;
  let emit;
  const start = (next) => {
    starts += 1;
    emit = next;
    return () => { stops += 1; };
  };
  const first = [];
  const second = [];
  const offFirst = subscribeShared("restaurant:r1", start, (value) => first.push(value), assert.fail);
  emit({ id: "p1" }, 1);
  const offSecond = subscribeShared("restaurant:r1", start, (value) => second.push(value), assert.fail);
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(starts, 1);
  assert.deepEqual(first, [{ id: "p1" }]);
  assert.deepEqual(second, [{ id: "p1" }]);
  assert.equal(getFirestoreMetrics().listenerReuses, 1);
  offFirst();
  offSecond();
  stopAllSharedListeners();
  assert.equal(stops, 1);
});
test("chaves de restaurantes diferentes nunca compartilham dados", () => {
  resetFirestoreMetrics();
  const values = { r1: [], r2: [] };
  const starts = new Map();
  const start = (key) => (emit) => {
    starts.set(key, emit);
    return () => undefined;
  };
  subscribeShared("products:r1", start("r1"), (value) => values.r1.push(value), assert.fail);
  subscribeShared("products:r2", start("r2"), (value) => values.r2.push(value), assert.fail);
  starts.get("r1")(["produto-r1"], 1);
  assert.deepEqual(values.r1, [["produto-r1"]]);
  assert.deepEqual(values.r2, []);
  stopAllSharedListeners();
});

test("encerramento global remove listeners e dados em memória", () => {
  resetFirestoreMetrics();
  let stopped = 0;
  subscribeShared("sensitive:orders:r1", () => () => { stopped += 1; }, () => undefined, assert.fail);
  stopAllSharedListeners();
  assert.equal(stopped, 1);
  assert.equal(getFirestoreMetrics().activeListeners, 0);
});
