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

## 5. Real project write, creator, readonly and expiry acceptance

- Surface: SDK createEntity, patchEntity, typed queries, createdBy, cursor paging, getEntity and Tiramisu transactions.
- Test identities: three new synthetic-role wallets, listed in `public/evidence/manifest.json`. Keys remain outside this repository. The buyer received 8 **test** GLM; no mainnet funds or paid APIs were used.
- Actual: 7/7 real chain scenarios passed: exact accepted handoff; one-sided delivery; outsider buyer and executor; stale version; mismatched digest; conflicting deliveries; conflicting proposal branch. Result snapshots include complete 1–3-page walks at a fixed block per scenario.
- Creator-filter query returned 15 buyer-created project entities in **8 pages at block 706556**. Every returned creator matched the buyer address. Page size was 2 to make the page boundary observable.
- A patch to the readonly root was rejected before broadcast (no transaction hash, buyer nonce unchanged at 18): `Transaction failed: entity ... was created readonly, so its contents can never change`. The root still decoded as a proposal afterwards. This is a measured rejection, not a claim that readonly prevents deletion or ownership transfer.
- Short-expiration probe: root created at block **706562**, `expiresAt=706566`, still readable before expiry at block 706564, absent at block **706566**. Requested duration: 8 seconds / 4 nominal blocks. SDK returns an absence error that combines never-created, deleted and expired; the separate creation receipt + observed expiry height establish which transition this probe tested.
- Reproduce: `node scripts/seed.mjs` with funded isolated Tiramisu test identities; query existing real roots with `node scripts/reproduce.mjs <rootKey>` without any secrets. Exact transactions and snapshots: `public/evidence/write-evidence.json`.
- Improvement: expose a typed absence reason when available, so an application can distinguish an expired record from a mistyped key without separately reading creation evidence. Keep uncertainty explicit when historical proof is unavailable.

## Deliberately not claimed

No real customer adoption, mainnet payment, work-quality verification, legal identity, complete historical audit, WebSocket stream, atomic batch or executed lifetime extension. Browser-wallet write controls are implemented but the user's injected-wallet signing flow is not counted as verified by the CLI tests. Public deployment and final registration are separately checked before submission.

## 6. Browser anonymous cost limit blocks sustained live review

- Surface: browser direct public RPC, real live scenario sweep, 18 October 2026.
- Expected: exact current task observation; on failure, no decision from a previous task.
- Actual: accepted, one-sided, fake-buyer and old-version live scenarios succeeded in the browser. A subsequent wrong-digest query failed. Added sanitized diagnostics identified **HTTP 429 / `ANON_COST_LIMITED`**, not a verifier mismatch. Manual retries and a reduced single-page query were still rate-limited. No specific quota-reset time was available, so no recovery time is invented.
- The UI cleared prior records, withheld its completion decision and showed LIVE QUERY FAILED. It did not replace network data with synthetic lab records. CLI reproduction of the same task succeeded, so CLI and browser availability are recorded separately.
- Optimization: browser page size defaults to 50; 2-record audit paging is optional. Scenario task names are untrusted discovery hints only: the trusted root must still appear, match and validate inside the same full live Arkiv query. This removes the separate root-lookup query for known examples. Hints never supply a business status or authority. New tests reject a hint whose result omits the root.
- Read the official Access Keys page: keys raise limits, and the documentation explicitly says to keep them out of the browser. `server/gateway.mjs` is prepared as an optional bounded read-only transport; no key or public gateway is present yet. Creation/deployment still needs the user's current authorization and operational verification. Direct independent queries remain available.
- Improvement for Arkiv: include a machine-readable cost budget and retry/reset information with ANON_COST_LIMITED, and offer a documented safe public-demo pattern. A plain generic HTTP message obscures whether a query, a wallet or the whole anonymous caller budget was limited.
- **Live risk at this checkpoint:** sustained anonymous browser access is not verified reliable. This gate must be resolved or explicitly held before final release. Do not use the successful CLI sweep as proof that the browser path is stable.
# Keyed transport follow-up (2026-10-18)

With explicit account-owner consent, a Tiramisu project access key was created and kept outside the repository in local server secret storage. A loopback-only read gateway using the official `X-API-KEY` header completed all seven real browser scenarios at blocks 707517–707535. This resolves the local keyed transport check, not public deployment or anonymous quota availability. The browser receives only a gateway endpoint, never the credential, and can still choose direct public RPC subject to its quota.

The first real keyed browser request exposed an integration defect in our prepared gateway: viem 2.57.7 serializes parameterless `eth_chainId` without a `params` property. Our mock had only sent `params: []`, so its green result did not cover the real caller. The strict guard incorrectly returned HTTP 403 `READ_QUERY_DENIED`. A test using the actual SDK transport reproduced that failure before the fix. Metadata reads now allow either omitted params or an empty array, while nonempty params, writes, batches and unscoped queries remain rejected. The same browser then completed acceptance, one-sided delivery, impostor identity, stale acceptance, wrong digest and both conflict cases against real Tiramisu records.

