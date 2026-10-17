import { createWalletClient } from "@arkiv-network/sdk";
import { jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFile, writeFile } from "node:fs/promises";
import { client } from "../src/arkiv.mjs";
if ((await client.getChainId()) !== 7738577) throw new Error("Wrong chain");
const keys = JSON.parse(
  await readFile(
    new URL("../../.secrets/wallets.json", import.meta.url),
    "utf8",
  ),
);
const account = privateKeyToAccount(keys.buyer),
  w = createWalletClient({
    account,
    chain: client.chain,
    transport: http(undefined, { retryCount: 0 }),
  });
const file = new URL(
    "../../evidence/probe/write-checkpoint.json",
    import.meta.url,
  ),
  run = JSON.parse(await readFile(file, "utf8"));
const key = run.scenarios[0].rootKey,
  before = await client.getEntity(key),
  nonceBefore = await client.getTransactionCount({ address: account.address });
let failure;
try {
  await w.patchEntity({
    entityKey: key,
    payload: jsonToPayload({ attack: "synthetic rewrite" }),
  });
  throw new Error("Unexpected patch success");
} catch (e) {
  const message = e.shortMessage || e.message;
  if (!/readonly/i.test(message)) throw e;
  failure = {
    observedAt: new Date().toISOString(),
    name: e.name,
    message,
    txHash: e.txHash ?? null,
  };
}
const nonceAfter = await client.getTransactionCount({
    address: account.address,
  }),
  after = await client.getEntity(key);
if (before.toText() !== after.toText()) throw new Error("Root changed");
if (failure.txHash) {
  const receipt = await client.getTransactionReceipt({ hash: failure.txHash });
  failure.receipt = {
    status: receipt.status,
    block: String(receipt.blockNumber),
  };
  if (receipt.status !== "reverted")
    throw new Error("Unexpected receipt status");
  failure.scope = "mined revert";
} else {
  if (nonceAfter !== nonceBefore)
    throw new Error("Nonce changed without recorded transaction; investigate");
  failure.scope = "pre-broadcast RPC rejection; no mined revert claimed";
}
failure.nonceBefore = nonceBefore;
failure.nonceAfter = nonceAfter;
failure.payloadUnchanged = true;
failure.passed = true;
run.readonlyNegative = failure;
await writeFile(file, JSON.stringify(run, null, 2));
await writeFile(
  "public/evidence/write-evidence.json",
  JSON.stringify(run, null, 2),
);
console.log(JSON.stringify(failure, null, 2));
