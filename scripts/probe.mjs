import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq, gte } from "@arkiv-network/sdk/query";
import { i32 } from "@arkiv-network/sdk/attr";
import { http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
const dir = new URL("../../.secrets/", import.meta.url);
await mkdir(dir, { recursive: true, mode: 0o700 });
await chmod(dir, 0o700);
let secrets;
try {
  secrets = JSON.parse(await readFile(new URL("wallets.json", dir), "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  secrets = Object.fromEntries(
    ["buyer", "executor", "outsider"].map((r) => [r, generatePrivateKey()]),
  );
  await writeFile(new URL("wallets.json", dir), JSON.stringify(secrets), {
    mode: 0o600,
    flag: "wx",
  });
}
const wallets = Object.fromEntries(
  Object.entries(secrets).map(([r, k]) => [r, privateKeyToAccount(k).address]),
);
const client = createPublicClient({
  chain: tiramisu,
  transport: http(undefined, { timeout: 12000, retryCount: 0 }),
});
const query = client
  .select()
  .where(eq("app", "agent3-handoff-lens-v1"), gte("version", i32(1)))
  .limit(2);
const out = {
  observedAt: new Date().toISOString(),
  sdk: "0.8.1",
  wallets,
  expectedChain: 7738577,
  chain: await client.getChainId(),
  block: String(await client.getBlockNumber()),
  query: query.toString(),
};
try {
  const result = await query.fetch();
  out.queryResult = {
    count: result.entities.length,
    block: String(result.blockNumber),
    hasNext: result.hasNextPage(),
  };
} catch (e) {
  out.queryError = { name: e.name, message: e.shortMessage || e.message };
}
out.balances = Object.fromEntries(
  await Promise.all(
    Object.entries(wallets).map(async ([r, address]) => [
      r,
      String(await client.getBalance({ address })),
    ]),
  ),
);
await mkdir(new URL("../../evidence/probe/", import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL("../../evidence/probe/read-only.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
