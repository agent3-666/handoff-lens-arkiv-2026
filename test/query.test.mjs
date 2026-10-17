import { test } from "node:test";
import assert from "node:assert/strict";
import { walk } from "../src/arkiv.mjs";
const ent = (k) => ({
  key: k,
  creator: "c",
  owner: "o",
  createdAt: 1n,
  expiresAt: 5n,
  creationFlags: { readonly: true },
  attributes: { version: { type: "i32", value: 1 } },
  toJson: () => ({ kind: "proposal" }),
});
const page = (entities, block, next) => ({
  entities,
  blockNumber: block,
  hasNextPage: () => Boolean(next),
  next: next,
});
const query = (p) => ({
  fetch: async () => p,
  toString: () => "test-only query",
});
test("walk consumes all pages at one block", async () => {
  const p2 = page([ent("b")], 10n);
  const p1 = page([ent("a")], 10n, async () => p2);
  const r = await walk(query(p1));
  assert.equal(r.records.length, 2);
  assert.equal(r.pages.length, 2);
  assert.equal(r.block, "10");
});
test("later page network error withholds partial result", async () => {
  const p = page([ent("a")], 10n, async () => {
    throw new Error("RPC unavailable");
  });
  await assert.rejects(walk(query(p)), /unavailable/);
});
test("pagination snapshot mismatch fails closed", async () => {
  const p = page([ent("a")], 10n, async () => page([ent("b")], 11n));
  await assert.rejects(walk(query(p)), /snapshot block/);
});
test("safe page budget cannot silently truncate", async () => {
  const p = page([ent("a")], 10n, async () => p);
  await assert.rejects(walk(query(p), 2), /page budget/);
});
test("first page network error fails closed", async () => {
  await assert.rejects(
    walk({
      fetch: async () => {
        throw new Error("offline");
      },
    }),
    /offline/,
  );
});
test("malformed JSON payload fails closed", async () => {
  const e = ent("a");
  e.toJson = () => {
    throw new Error("bad JSON");
  };
  await assert.rejects(walk(query(page([e], 10n))), /bad JSON/);
});

import { readTask } from "../src/arkiv.mjs";
import { labScenario } from "../src/lab.mjs";
function taskClient(pages, chain = 7738577) {
  let index = 0;
  return {
    getChainId: async () => chain,
    getBlockNumber: async () => 200n,
    select() {
      const q = {
        where() {
          return q;
        },
        atBlock() {
          return q;
        },
        limit() {
          return q;
        },
        toString() {
          return "mock snapshot query";
        },
        async fetch() {
          return pages[index++];
        },
      };
      return q;
    },
    get requests() {
      return index;
    },
  };
}
function sdkRecords(records) {
  return records.map((e) => ({
    ...e,
    createdAt: BigInt(e.createdAt),
    expiresAt: BigInt(e.expiresAt),
    creationFlags: { readonly: e.readonly },
    toJson: () => e.payload,
  }));
}
test("discovery hint cannot establish authority when the root is missing", async () => {
  const s = labScenario("accepted"),
    c = taskClient([page(sdkRecords(s.records.slice(1)), 200n)]);
  await assert.rejects(
    readTask(s.rootKey, c, { taskHint: s.records[0].payload.task }),
    /Root missing/,
  );
});
test("validated discovery hint preserves exact root and reduces query count", async () => {
  const s = labScenario("accepted"),
    c = taskClient([page(sdkRecords(s.records), 200n)]);
  const r = await readTask(s.rootKey, c, {
    taskHint: s.records[0].payload.task,
  });
  assert.equal(r.root.key, s.rootKey);
  assert.equal(r.records.length, 3);
  assert.equal(c.requests, 1);
});
test("manual root queries and task page use the same block", async () => {
  const s = labScenario("accepted"),
    c = taskClient([
      page(sdkRecords(s.records.slice(0, 1)), 200n),
      page(sdkRecords(s.records), 200n),
    ]);
  assert.equal((await readTask(s.rootKey, c)).root.key, s.rootKey);
  assert.equal(c.requests, 2);
});
test("wrong RPC network is rejected before fetching any entities", async () => {
  const s = labScenario("accepted"),
    c = taskClient([], 1);
  await assert.rejects(readTask(s.rootKey, c), /Wrong RPC chain/);
  assert.equal(c.requests, 0);
});
