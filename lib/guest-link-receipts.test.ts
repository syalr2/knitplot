import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listGuestLinkReceipts,
  newGuestLinkKey,
  readGuestLinkReceipt,
  removeGuestLinkReceipt,
  saveGuestLinkReceipt,
} from "./guest-link-receipts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("old and pending links are recoverable independently of the workspace", () => {
  const storage = memoryStorage();
  const revokeToken = newGuestLinkKey();
  assert.match(revokeToken, /^[A-Za-z0-9_-]{32}$/);
  storage.setItem(
    "knitplot-draft-link-v1:closed-tab",
    JSON.stringify({
      token: "k8J4qX",
      revokeToken,
      slug: "old-chart",
    }),
  );
  const key = newGuestLinkKey();
  const pending = { title: "New chart", revokeToken: key };
  saveGuestLinkReceipt(storage, pending);
  assert.deepEqual(listGuestLinkReceipts(storage), [
    {
      title: "old chart",
      revokeToken,
      token: "k8J4qX",
      slug: "old-chart",
      tabId: "closed-tab",
    },
    pending,
  ]);
  saveGuestLinkReceipt(storage, {
    title: "Recovered chart",
    revokeToken,
    token: "k8J4qX",
    slug: "old-chart",
  });
  assert.equal(listGuestLinkReceipts(storage).length, 2);
  removeGuestLinkReceipt(storage, revokeToken);
  assert.deepEqual(listGuestLinkReceipts(storage), [pending]);
  assert.equal(readGuestLinkReceipt({ revokeToken, token: "k8J4qX" }), null);
});
