/** Optional key-protected read gateway. No private data or business database. */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
const UPSTREAM = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
const taskQuery =
  /^app = str\('agent3-handoff-lens-v1'\) AND task = str\('demo-[a-z0-9-]{1,64}'\) AND version >= i32\(1\)$/;
const rootQuery = /^\$key = key\(0x[0-9a-fA-F]{64}\)$/;
export function validateRead(body) {
  if (
    !body ||
    Array.isArray(body) ||
    body.jsonrpc !== "2.0" ||
    !["string", "number"].includes(typeof body.id)
  )
    return false;
  if (["eth_chainId", "eth_blockNumber"].includes(body.method))
    return body.params === undefined || (Array.isArray(body.params) && body.params.length === 0);
  if (
    body.method !== "arkiv_query" ||
    !Array.isArray(body.params) ||
    body.params.length !== 2
  )
    return false;
  const [query, options] = body.params;
  if (
    typeof query !== "string" ||
    (!taskQuery.test(query) && !rootQuery.test(query)) ||
    !options ||
    typeof options !== "object" ||
    Array.isArray(options)
  )
    return false;
  const allowed = new Set(["select", "limit", "cursor", "atBlock"]);
  if (Object.keys(options).some((k) => !allowed.has(k))) return false;
  if (
    !/^0x[0-9a-f]+$/i.test(options.limit ?? "") ||
    !/^0x[0-9a-f]+$/i.test(options.atBlock ?? "")
  )
    return false;
  const limit = Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return false;
  if (
    options.cursor !== undefined &&
    (typeof options.cursor !== "string" || options.cursor.length > 4096)
  )
    return false;
  return true;
}
export function createReadGateway({
  forward,
  origins,
  capacity = 120,
  windowMs = 60000,
} = {}) {
  if (
    typeof forward !== "function" ||
    !Array.isArray(origins) ||
    !origins.length
  )
    throw new Error("Explicit forwarder and origins required");
  const clients = new Map();
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, code) => {
      res.statusCode = status;
      res.end(JSON.stringify({ error: code }));
    };
    if (origin && !origins.includes(origin)) return send(403, "ORIGIN_DENIED");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.url !== "/rpc") return send(404, "NOT_FOUND");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.statusCode = 204;
      return res.end();
    }
    if (req.method !== "POST") return send(405, "POST_REQUIRED");
    // In-memory capacity guard; no request bodies, IPs or keys are logged.
    const now = Date.now(),
      address = req.socket.remoteAddress ?? "unknown";
    for (const [k, v] of clients)
      if (now - v.start > windowMs) clients.delete(k);
    const bucket = clients.get(address) ?? { start: now, count: 0 };
    bucket.count++;
    clients.set(address, bucket);
    if (bucket.count > capacity) {
      res.setHeader(
        "Retry-After",
        Math.ceil((windowMs - (now - bucket.start)) / 1000),
      );
      return send(429, "GATEWAY_RATE_LIMIT");
    }
    let chunks = [],
      bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 16384) return send(413, "BODY_TOO_LARGE");
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(400, "INVALID_JSON");
      }
      if (!validateRead(body)) return send(403, "READ_QUERY_DENIED");
      const response = await forward(body);
      if (!response || !Number.isInteger(response.status))
        throw new Error("bad upstream response");
      if (response.retryAfter)
        res.setHeader("Retry-After", response.retryAfter);
      res.statusCode = response.status;
      res.end(response.body);
    } catch {
      send(502, "ARKIV_READ_UNAVAILABLE");
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const accessKey = process.env.ARKIV_RPC_KEY,
    origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
  if (!accessKey || !origins.length)
    throw new Error(
      "Set ARKIV_RPC_KEY and ALLOWED_ORIGINS through server secret/config storage.",
    );
  const server = createReadGateway({
    origins,
    forward: async (body) => {
      const response = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": accessKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      return {
        status: response.status,
        body: await response.text(),
        retryAfter: response.headers.get("retry-after"),
      };
    },
  });
  const port = Number(process.env.PORT ?? 5192);
  server.listen(port, process.env.HOST ?? "127.0.0.1", () =>
    console.log("Read gateway listening; secrets are not printed."),
  );
}
