"use client";

export type FirestoreMetrics = {
  listenerStarts: number;
  listenerReuses: number;
  listenerStops: number;
  snapshots: number;
  documentsDelivered: number;
  activeListeners: number;
  peakListeners: number;
};

const empty = (): FirestoreMetrics => ({ listenerStarts: 0, listenerReuses: 0, listenerStops: 0, snapshots: 0, documentsDelivered: 0, activeListeners: 0, peakListeners: 0 });
let metrics = empty();

export function recordFirestoreMetric(type: "start" | "reuse" | "stop" | "snapshot", documents = 0) {
  if (type === "start") {
    metrics.listenerStarts += 1;
    metrics.activeListeners += 1;
    metrics.peakListeners = Math.max(metrics.peakListeners, metrics.activeListeners);
  } else if (type === "reuse") metrics.listenerReuses += 1;
  else if (type === "stop") {
    metrics.listenerStops += 1;
    metrics.activeListeners = Math.max(0, metrics.activeListeners - 1);
  } else {
    metrics.snapshots += 1;
    metrics.documentsDelivered += Math.max(0, documents);
  }
}

export const getFirestoreMetrics = (): FirestoreMetrics => ({ ...metrics });
export const resetFirestoreMetrics = () => { metrics = empty(); };
