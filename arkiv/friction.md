# Arkiv integration field notes

Tested 18 October 2026 (UTC+8). SDK **0.8.1**, viem **2.57.7**, Node **20.19.6**. All data created by this application is synthetic. These are observed results, not invented feedback.

## 1. Typed compound query works against the public RPC

- Surface: TypeScript SDK / public Tiramisu JSON-RPC.
- Expected: connect to chain 7738577; parse a typed string equality plus numeric range.
- Actual: chain ID 7738577, block 706008; `app = str('agent3-handoff-lens-v1') AND version >= i32(1)` returned zero existing project records at block 706009. This validates the empty-query path, not a project write.
- Reproduce: `npm ci && npm run probe`. This creates fresh local test keys only when absent, outside the repo. Public evidence: `../evidence/probe/read-only.json` in the private working folder; public write evidence is not yet available.
- Improvement: distinguish empty results from a network failure in every starter app. Our live UI never falls back to examples.

## 2. Official event guidance and SDK disagree on `$createdAt` filtering

- Surface: canonical event `AGENTS.md` versus installed SDK query builder.
- Expected: event guidance says to range-filter `$createdAt` instead of server-side ordering.
- Actual: `gte('$createdAt', u64(0n))` throws `InvalidPredicateError`: result-only field, no index. The 0.8.1 source identifies only `$key`, `$owner`, `$creator`, `$expiresAt` as queryable system attributes.
- Reproduce: `node --input-type=module -e 'import {gte} from "@arkiv-network/sdk/query"; import {u64} from "@arkiv-network/sdk/attr"; console.log(gte("$createdAt",u64(0n)))'`.
- Workaround: query typed app/task/version attributes and sort or inspect creation heights client-side. Our application never filters `$createdAt`.
- Improvement: amend the event guidance and add a versioned supported-system-attributes table.

## 3. Unpinned-block `next()` produced a cursor binding error

- Surface: `QueryResult.next()` over public HTTP RPC.
- Expected: per SDK docs, every page of a walk reads the same snapshot automatically.
- Actual: first `$expiresAt >= u64(1)` page succeeded, the next page failed with code -32005, data `cursor belongs to a different query, block or select — start a new page-through`. A small limit (1) was used to exercise pagination. No partial result was accepted.
- Reproduce: build `client.select({key:true,creator:true,createdAt:true}).where(gte('$expiresAt',u64(1n))).limit(1)`, fetch, then `next()` if a cursor is present. Public chain state is changing, so the exact occurrence is timing-dependent.
- Mitigation verified for a two-page walk: pin `atBlock(await client.getBlockNumber())` before the first fetch. At block 706163, both pages returned one entity and the same block. `scripts/query-positive.mjs` reproduces this. The app also rejects any block mismatch or later-page failure.
- Improvement: make `next()` always transmit the returned snapshot height when the first request omitted `atBlock`, or clarify the backend cursor contract and SDK implementation.

## 4. Funding requires a connected wallet

- Surface: official Hub faucet UI, 18 October 2026.
- Expected: free test GLM for newly generated test identities.
- Actual: Hub requires connecting a wallet, with Rainbow/Base/MetaMask/WalletConnect options. There is no visible address-only input before connection. The three project test wallets each had zero GLM. We did not import private keys into a browser or bypass authentication.
- Reproduce: open https://hub.arkiv.network/faucet signed out.
- Next: fund the synthetic buyer address through a user-controlled connected test wallet, then distribute test gas to the executor and negative-test identity. No mainnet or paid funds.
- Improvement: documented faucet CLI for isolated development accounts, subject to the same limits and authentication requirements.

## Untested at this checkpoint

Project writes, readonly-patch rejection, creator-filter positive/negative queries, live project pagination and expiry transition require funding. They must not be claimed until the execution evidence is added. This report will be updated with actual results.
