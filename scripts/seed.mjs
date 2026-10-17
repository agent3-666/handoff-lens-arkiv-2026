// Testnet-only deterministic scenario writer. Never use these test keys on a production network.
import { createWalletClient } from "@arkiv-network/sdk";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { eq } from "@arkiv-network/sdk/query";
import { http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { client, entityInput, readTask, walk } from "../src/arkiv.mjs";
import { APP, digest, evaluate } from "../src/model.mjs";
const secretsURL = new URL("../../.secrets/wallets.json", import.meta.url);
if (((await stat(secretsURL)).mode & 0o077) !== 0)
  throw new Error("Test secret file must be mode 600.");
if ((await client.getChainId()) !== 7738577)
  throw new Error("Wrong chain; refusing write.");
const secret = JSON.parse(await readFile(secretsURL, "utf8"));
const accounts = Object.fromEntries(
  Object.entries(secret).map(([r, k]) => [r, privateKeyToAccount(k)]),
);
const writers = Object.fromEntries(
  Object.entries(accounts).map(([r, account]) => [
    r,
    createWalletClient({
      chain: client.chain,
      account,
      transport: http(undefined, { timeout: 15000, retryCount: 0 }),
    }),
  ]),
);
const base = new URL("../../evidence/probe/", import.meta.url);
await mkdir(base, { recursive: true });
let run;
try {
  run = JSON.parse(
    await readFile(new URL("write-checkpoint.json", base), "utf8"),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  run = {
    startedAt: new Date().toISOString(),
    runId: Date.now().toString(36),
    chain: 7738577,
    transactions: [],
    scenarios: [],
  };
}
const save = () =>
  writeFile(
    new URL("write-checkpoint.json", base),
    JSON.stringify(run, null, 2),
  );
const buyerBalance = await client.getBalance({
  address: accounts.buyer.address,
});
if (buyerBalance === 0n) {
  run.status = "WAITING_FOR_TEST_GLM";
  await save();
  console.log(
    JSON.stringify({ status: run.status, buyer: accounts.buyer.address }),
  );
  process.exit(2);
}
for (const r of ["executor", "outsider"]) {
  const balance = await client.getBalance({ address: accounts[r].address });
  if (balance === 0n) {
    const available = await client.getBalance({
      address: accounts.buyer.address,
    });
    const value =
      available / 4n < parseEther("0.1") ? available / 4n : parseEther("0.1");
    if (value < 1000000000000n) throw new Error("Insufficient test GLM.");
    const hash = await writers.buyer.sendTransaction({
      to: accounts[r].address,
      value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error("Gas funding transaction failed");
    run.transactions.push({
      kind: "test-gas-distribution",
      role: r,
      txHash: hash,
      value: String(value),
    });
    await save();
  }
}
async function write(role, payload, label, shortExpiry) {
  const old = run.transactions.find((t) => t.label === label);
  if (old) return old;
  const result = await writers[role].createEntity(
    entityInput(payload, { shortExpiry }),
  );
  const receipt = await client.getTransactionReceipt({ hash: result.txHash });
  if (receipt.status !== "success") throw new Error("Create receipt failed");
  const stored = await client.getEntity(result.entityKey);
  const item = {
    label,
    role,
    creator: accounts[role].address,
    ...result,
    expiresAt: String(stored.expiresAt),
    blockNumber: String(receipt.blockNumber),
  };
  run.transactions.push(item);
  await save();
  console.log(JSON.stringify(item));
  return item;
}
for (const mode of [
  "accepted",
  "one-sided",
  "fake-buyer",
  "old-version",
  "wrong-digest",
  "conflict",
  "proposal-branch",
]) {
  const task = `demo-${run.runId}-${mode}`;
  const root = await write(
    "buyer",
    {
      kind: "proposal",
      task,
      version: 1,
      rootKey: null,
      executor: accounts.executor.address,
      summary: "SYNTHETIC test task: numbered test report.",
    },
    mode + "-root",
  );
  let proposalKey = root.entityKey;
  const common = { task, version: 1, rootKey: root.entityKey, proposalKey };
  const hash = digest("SYNTHETIC test report version 1");
  const d = await write(
    "executor",
    { ...common, kind: "delivery", digest: hash },
    mode + "-delivery",
  );
  if (mode !== "one-sided")
    await write(
      mode === "fake-buyer" ? "outsider" : "buyer",
      {
        ...common,
        kind: "acceptance",
        deliveryKey: d.entityKey,
        digest:
          mode === "wrong-digest"
            ? digest("SYNTHETIC mismatched content")
            : hash,
        role: "buyer",
      },
      mode + "-acceptance",
    );
  if (mode === "fake-buyer")
    await write(
      "outsider",
      { ...common, kind: "delivery", digest: hash, role: "executor" },
      mode + "-fake-executor",
    );
  if (mode === "old-version" || mode === "proposal-branch") {
    const p = await write(
      "buyer",
      {
        kind: "proposal",
        task,
        version: 2,
        rootKey: root.entityKey,
        executor: accounts.executor.address,
        summary: "SYNTHETIC changed requirement.",
      },
      mode + "-proposal-v2",
    );
    if (mode === "old-version")
      await write(
        "executor",
        {
          ...common,
          version: 2,
          proposalKey: p.entityKey,
          kind: "delivery",
          digest: digest("SYNTHETIC test report version 2"),
        },
        mode + "-delivery-v2",
      );
    else
      await write(
        "buyer",
        {
          kind: "proposal",
          task,
          version: 2,
          rootKey: root.entityKey,
          executor: accounts.executor.address,
          summary: "SYNTHETIC competing requirement.",
        },
        mode + "-branch-v2",
      );
  }
  if (mode === "conflict")
    await write(
      "executor",
      {
        ...common,
        kind: "delivery",
        digest: digest("SYNTHETIC competing report"),
      },
      mode + "-conflicting-delivery",
    );
  const observation = await readTask(root.entityKey, client, { pageSize: 2 });
  const result = evaluate(
    observation.records,
    root.entityKey,
    observation.block,
  );
  const expected = {
    accepted: "ACCEPTED",
    "one-sided": "AWAITING_ACCEPTANCE",
    "fake-buyer": "AWAITING_ACCEPTANCE",
    "old-version": "AWAITING_ACCEPTANCE",
    "wrong-digest": "AWAITING_ACCEPTANCE",
    conflict: "CONFLICT",
    "proposal-branch": "CONFLICT",
  }[mode];
  const entry = {
    mode,
    label: mode,
    rootKey: root.entityKey,
    expected,
    actual: result.state,
    passed: expected === result.state,
    observation: { ...observation, result },
  };
  const at = run.scenarios.findIndex((s) => s.mode === mode);
  if (at < 0) run.scenarios.push(entry);
  else run.scenarios[at] = entry;
  await save();
  if (!entry.passed) throw new Error("Real scenario failed: " + mode);
}
const creatorQuery = client
  .select()
  .where(eq("app", APP))
  .createdBy(accounts.buyer.address)
  .atBlock(await client.getBlockNumber())
  .limit(2);
const creatorResult = await walk(creatorQuery);
if (
  !creatorResult.records.length ||
  creatorResult.records.some(
    (e) => e.creator.toLowerCase() !== accounts.buyer.address.toLowerCase(),
  )
)
  throw new Error("Creator query failed");
run.creatorQuery = {
  query: creatorResult.query,
  count: creatorResult.records.length,
  pages: creatorResult.pages,
  passed: true,
};
await save();
try {
  await writers.buyer.patchEntity({
    entityKey: run.scenarios[0].rootKey,
    payload: jsonToPayload({ attack: "synthetic rewrite" }),
  });
  throw new Error("Readonly patch unexpectedly succeeded");
} catch (e) {
  if (e.message === "Readonly patch unexpectedly succeeded") throw e;
  const msg = e.shortMessage || e.message;
  if (!/readonly|read.only|immutable/i.test(msg))
    throw new Error("Readonly negative inconclusive: " + msg);
  const unchanged = await client.getEntity(run.scenarios[0].rootKey);
  if (unchanged.toJson().kind !== "proposal")
    throw new Error("Readonly entity changed");
  run.readonlyNegative = {
    observedAt: new Date().toISOString(),
    message: e.shortMessage || e.message,
    passed: true,
    scope:
      "RPC/transaction rejection; inspect error to distinguish estimation from mined revert",
  };
  await save();
}
const expiry = await write(
  "buyer",
  {
    kind: "proposal",
    task: `demo-${run.runId}-expiry`,
    version: 1,
    rootKey: null,
    executor: accounts.executor.address,
    summary: "SYNTHETIC short-expiry probe",
  },
  "expiry-root",
  ExpirationTime.fromSeconds(8),
);
run.expiry = {
  key: expiry.entityKey,
  expiresAt: expiry.expiresAt,
  beforeBlock: String(await client.getBlockNumber()),
  after: null,
};
await save();
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  const b = await client.getBlockNumber({ cacheTime: 0 });
  if (b >= BigInt(expiry.expiresAt)) {
    try {
      await client.getEntity(expiry.entityKey);
      run.expiry.after = { block: String(b), absent: false };
    } catch (e) {
      run.expiry.after = {
        block: String(b),
        absent: true,
        error: e.shortMessage || e.message,
      };
    }
    break;
  }
  await new Promise((r) => setTimeout(r, 1500));
}
if (!run.expiry.after?.absent)
  throw new Error("Expiry transition not verified");
run.status = "REAL_TESTNET_ACCEPTANCE_COMPLETE";
run.finishedAt = new Date().toISOString();
await save();
await mkdir("public/evidence", { recursive: true });
await writeFile(
  "public/evidence/manifest.json",
  JSON.stringify(
    {
      chain: 7738577,
      app: APP,
      wallets: Object.fromEntries(
        Object.entries(accounts).map(([r, a]) => [r, a.address]),
      ),
      scenarios: run.scenarios.map(
        ({ mode, label, rootKey, expected, observation }) => ({
          mode,
          label,
          rootKey,
          expected,
          task: observation.root.payload.task,
        }),
      ),
      evidence: "./write-evidence.json",
    },
    null,
    2,
  ),
);
await writeFile(
  "public/evidence/write-evidence.json",
  JSON.stringify(run, null, 2),
);
console.log(run.status);
