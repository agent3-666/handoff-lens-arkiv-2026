import { test } from "node:test";
import assert from "node:assert/strict";
import { createReadGateway, validateRead } from "../server/gateway.mjs";
const task = {
  jsonrpc: "2.0",
  id: 1,
  method: "arkiv_query",
  params: [
    "app = str('agent3-handoff-lens-v1') AND task = str('demo-test') AND version >= i32(1)",
    { limit: "0x32", atBlock: "0x1" },
  ],
};
test("gateway accepts only project-scoped bounded reads", () => {
  assert.ok(validateRead(task));
  assert.ok(
    validateRead({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  );
});
test("gateway rejects writes, batches and unscoped queries", () => {
  assert.equal(
    validateRead({ ...task, method: "eth_sendRawTransaction" }),
    false,
  );
  assert.equal(validateRead([task]), false);
  assert.equal(
    validateRead({ ...task, params: ["$expiresAt >= u64(1)", task.params[1]] }),
    false,
  );
  assert.equal(
    validateRead({
      ...task,
      params: [task.params[0], { ...task.params[1], limit: "0xc8" }],
    }),
    false,
  );
});
test("HTTP gateway forwards approved reads and denies writes or unknown origins", async () => {
  let calls = 0;
  const server = createReadGateway({
    origins: ["http://127.0.0.1:5188"],
    forward: async (body) => {
      calls++;
      return {
        status: 200,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: "0x7614d1",
        }),
      };
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/rpc`;
  try {
    const request = (body) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:5188",
        },
        body: JSON.stringify(body),
      });
    const good = await request({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).result, "0x7614d1");
    assert.equal(
      (await request({ ...task, method: "eth_sendRawTransaction" })).status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { Origin: "https://example.invalid" },
          body: JSON.stringify(task),
        })
      ).status,
      403,
    );
    assert.equal(calls, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("gateway quota failure is explicit and is never a successful cached result", async () => {
  const server = createReadGateway({
    capacity: 1,
    origins: ["http://localhost"],
    forward: async () => ({ status: 200, body: "{}" }),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/rpc`;
  try {
    const options = {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    };
    assert.equal((await fetch(url, options)).status, 200);
    const limited = await fetch(url, options);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("Retry-After"));
  } finally {
    await new Promise((r) => server.close(r));
  }
});
