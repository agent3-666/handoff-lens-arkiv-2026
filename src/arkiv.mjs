import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq, gte } from "@arkiv-network/sdk/query";
import { i32, key } from "@arkiv-network/sdk/attr";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http, custom } from "viem";
import { APP, normalize } from "./model.mjs";
export const RPC = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
const configuredGateway = import.meta.env?.VITE_READ_GATEWAY;
if (configuredGateway) {
  const url = new URL(configuredGateway);
  if (
    (url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/rpc"
  ) {
    throw new Error(
      "Read gateway must be a public HTTPS /rpc endpoint, with no credentials or query string.",
    );
  }
}
export const READ_ENDPOINT = configuredGateway || RPC;
export const GATEWAY_CONFIGURED = Boolean(configuredGateway);
export const directClient = createPublicClient({
  chain: tiramisu,
  transport: http(RPC, { timeout: 12000, retryCount: 0 }),
});
export const client = GATEWAY_CONFIGURED
  ? createPublicClient({
      chain: tiramisu,
      transport: http(READ_ENDPOINT, { timeout: 12000, retryCount: 0 }),
    })
  : directClient;
export function taskQuery(c, task, block, pageSize = 2) {
  return c
    .select()
    .where(eq("app", APP), eq("task", task), gte("version", i32(1)))
    .atBlock(block)
    .limit(pageSize);
}
export async function walk(query, maxPages = 50) {
  const records = [],
    pages = [];
  let page = await query.fetch();
  const block = page.blockNumber;
  for (let i = 0; i < maxPages; i++) {
    if (page.blockNumber !== block)
      throw new Error("Pagination changed snapshot block. Decision withheld.");
    records.push(...page.entities.map(normalize));
    pages.push({
      block: String(page.blockNumber),
      count: page.entities.length,
      hasNext: page.hasNextPage(),
    });
    if (!page.hasNextPage())
      return { records, pages, block: String(block), query: query.toString() };
    if (i === maxPages - 1)
      throw new Error("Query exceeded safe page budget. Decision withheld.");
    page = await page.next();
  }
  throw new Error("Incomplete query");
}
export async function readTask(
  rootKey,
  c = client,
  { pageSize = 50, taskHint } = {},
) {
  if (!/^0x[0-9a-f]{64}$/i.test(rootKey))
    throw new Error("Enter a 32-byte Arkiv root entity key.");
  if ((await c.getChainId()) !== 7738577)
    throw new Error("Wrong RPC chain. Expected Tiramisu 7738577.");
  const block = await c.getBlockNumber();
  // A discovery hint only narrows a query. Authority still comes from the root
  // returned inside the same complete, snapshot-bound Arkiv observation.
  let task = taskHint;
  if (typeof task !== "string" || !/^demo-[a-z0-9-]{1,64}$/.test(task)) {
    const rootPage = await c
      .select()
      .where(eq("$key", key(rootKey)))
      .atBlock(block)
      .limit(1)
      .fetch();
    if (rootPage.blockNumber !== block)
      throw new Error("Root query changed snapshot block.");
    if (rootPage.entities.length !== 1)
      throw new Error(
        "Root expired, deleted or absent. Cannot establish buyer authority.",
      );
    task = normalize(rootPage.entities[0]).payload?.task;
  }
  if (typeof task !== "string" || !/^demo-[a-z0-9-]{1,64}$/.test(task))
    throw new Error("Root has no valid synthetic task.");
  const result = await walk(taskQuery(c, task, block, pageSize));
  const root = result.records.find(
    (e) => e.key.toLowerCase() === rootKey.toLowerCase(),
  );
  if (!root || root.payload?.task !== task)
    throw new Error("Root missing from task query. Decision withheld.");
  return { ...result, root };
}
export function entityInput(payload, { shortExpiry } = {}) {
  return {
    payload: jsonToPayload(payload),
    contentType: "application/json",
    attributes: {
      app: APP,
      task: payload.task,
      kind: payload.kind,
      version: i32(payload.version),
    },
    expires:
      shortExpiry ??
      ExpirationTime.fromDays(
        { proposal: 14, delivery: 10, acceptance: 7 }[payload.kind],
      ),
    flags: { readonly: true, permissionlessExtension: true },
  };
}
export function injectedWallet(provider, account) {
  return createWalletClient({
    chain: tiramisu,
    transport: custom(provider),
    account,
  });
}
