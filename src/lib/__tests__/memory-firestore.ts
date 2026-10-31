import { expect } from "vitest";
import type { createGmailStore } from "../../../functions/gmail/store";

// firebase-admin is installed for the Functions only: take its type from a store.
type Firestore = Parameters<typeof createGmailStore>[0];

export type Doc = Record<string, unknown>;
interface Ref { path: string }

/**
 * Just enough of Firestore for the Gmail and Slack stores, kept in a Map.
 * Transactions refuse a read after a write, as the real one does.
 */
export function memoryFirestore() {
  const data = new Map<string, Doc>();
  const snap = (path: string) => ({
    exists: data.has(path),
    data: () => {
      const value = data.get(path);
      return value ? { ...value, ...(value.expiresAt instanceof Date ? { expiresAt: { toDate: () => value.expiresAt } } : {}) } : undefined;
    },
  });
  const reference = (path: string) => ({ path, get: async () => snap(path), set: async (value: Doc) => { data.set(path, value); } });
  const transaction = (writes: (() => void)[]) => ({
    get: async (ref: Ref) => { expect(writes).toHaveLength(0); return snap(ref.path); },
    set: (ref: Ref, value: Doc) => writes.push(() => data.set(ref.path, value)),
    update: (ref: Ref, value: Doc) => writes.push(() => data.set(ref.path, { ...data.get(ref.path), ...value })),
    delete: (ref: Ref) => writes.push(() => data.delete(ref.path)),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
      where: (field: string, _op: string, value: unknown) => ({ get: async () => {
        const docs = [...data].filter(([key, record]) => key.startsWith(`${name}/`) && record[field] === value).map(([key]) => ({ ref: reference(key), data: () => snap(key).data() }));
        return { docs, empty: !docs.length };
      } }),
    }),
    batch: () => {
      const removed: string[] = [];
      return { delete: (ref: Ref) => removed.push(ref.path), commit: async () => removed.forEach((path) => data.delete(path)) };
    },
    runTransaction: async <T>(callback: (tx: ReturnType<typeof transaction>) => Promise<T>) => {
      const writes: (() => void)[] = [];
      const result = await callback(transaction(writes));
      writes.forEach((apply) => apply());
      return result;
    },
  };
  // The stores are typed against the real client; this covers what they call.
  return { db: db as unknown as Firestore, data };
}
