# Agent3 Handoff Lens

**“Delivered” is a claim. Acceptance is separate.**

A buyer can be misled by a completion badge that only reflects an executor's statement, or by an old acceptance carried into a new task version. Handoff Lens reads independently published Arkiv entities and separates those statements by their immutable on-chain creator. A buyer acceptance must bind the exact proposal version, delivery key and synthetic digest.

Primary track: **Security**. Secondary fit: **Censorship Resistance** and **Open Source**. This is an internal synthetic test application, with no claimed external adoption.

[Live app](https://agent3-666.github.io/handoff-lens-arkiv-2026/) · [100-second demo](https://agent3-666.github.io/handoff-lens-arkiv-2026/demo.html)

The public deployment completed all seven real scenarios without login, a project credential or our gateway at blocks 707869–707872. With the local gateway stopped, a separate two-page direct query completed at block 707883. These are observed checks, not a guarantee of future public-RPC quota availability. Public observations and creation timing are in `public/evidence/`.

## Run

Requires Node 20.19+, 22.13+, or 24+.

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:5188`. `npm run build` creates `dist/`, deployable as static files at a root or subpath. The default public RPC query path needs no account or team backend, but sustained anonymous browser reads encountered an actual Arkiv cost limit. A later direct browser recheck succeeded at block 707786; this does not guarantee quota availability. A secret-protected optional read gateway was locally verified with all seven real scenarios, but is not publicly deployed; see `server/README.md`. The public static build uses direct public RPC and contains no access key. A wallet is needed only to create synthetic test records.

- **Live Arkiv query:** enter a trusted root proposal entity key. Every page is queried directly from Tiramisu at one block. A missing root or failed page withholds the decision. No fixture fallback.
- **Synthetic safety lab:** try the accepted, one-sided, fake-buyer, old-version, wrong-digest, conflicting-delivery and expiry examples. These local examples are explicitly separate from chain state. They run the same verifier, and do not represent transactions, users or adoption.
- **Write a synthetic handoff:** connect an injected Tiramisu test wallet, specify a different executor, create a root. Switch to that executor to claim delivery, then back to the buyer to accept. Payloads are fixed synthetic text only. Each write costs **test GLM gas**. No mainnet support or paid API.

## Security model

The root creator is the buyer. The readonly root binds an executor wallet. Other proposals and acceptances must come from that buyer; delivery claims must come from that executor. Neither a role string nor `$owner` grants identity. Readonly creation flags are required so payloads cannot change after publication.

Acceptance references the current proposal entity, exact delivery entity key and exact digest. A new version invalidates an older acceptance. Competing proposals at one version or differing delivery digests show a conflict instead of picking the last writer. Incomplete pagination never yields success. Query resource limits fail closed.

The root key is a trust anchor: users must verify it and its creator through an independent trusted channel. A creator wallet is not a verified person. Only current available statements are checked; owners can delete records even when readonly, and all entities expire. This does **not** prove delivery quality, payment, legal identity, full historical completeness, or legal arbitration.

## Arkiv integration

- **Tiramisu** chain `7738577`, public HTTP RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.
- SDK pinned to **0.8.1**; viem **2.57.7**; Vite **7.3.7**. Lockfile included.
- Typed `app`, `task`, `kind` and numeric `version` attributes; JSON payload holds non-query fields.
- `$creator` and readonly flags are surfaced in the UI. Creator filtering is also exercised by the testnet acceptance script.
- Snapshot-bound cursor pagination makes page completeness visible. Browser default is 50 records/page; optional two-record audit paging exercises boundaries. Resource cap: 50 pages.
- Entity Expiration follows a bounded task/dispute period: proposal 14 days, delivery 10 days, acceptance 7 days. The actual expiry block is displayed. Permissionless extension is enabled, but an extension operation is not claimed unless measured.

Data contract and exact queries: [arkiv/schema.md](arkiv/schema.md). Integration feedback: [arkiv/friction.md](arkiv/friction.md).

## Reproduce and inspect evidence

`npm run probe` checks chain ID, a typed empty-project query and test wallet balances. It generates three disposable test identities in **`../.secrets/wallets.json` outside this repository**, mode 600, only when absent. Never use these keys on production, and never publish them.

`node scripts/query-positive.mjs` exercises a real known-positive public query and snapshot-bound pagination without requesting payloads or personal data. This is network plumbing evidence, not project adoption.

`node scripts/seed.mjs` requires funded disposable Tiramisu test wallets. It is checkpointed so resuming does not recreate already recorded transactions. It creates only synthetic proposals/deliveries/acceptances for seven scenarios, checks their actual current chain state, probes a rejected readonly patch and a short expiry transition. It exits with `WAITING_FOR_TEST_GLM` when the buyer has no gas. The initial execution completed: 7/7 real chain scenarios passed. The evidence includes 26 durable scenario entities, one short-expiration probe and two test-gas transfers. A rejected readonly patch is recorded separately. A successful local test is not used as a substitute for these real observations.

`node scripts/reproduce.mjs <rootKey>` queries a task and prints the exact query, page counts and verifier result. No test secrets required.

`public/evidence/manifest.json` lists real scenario keys and creators; `write-evidence.json` includes creation transactions and observed query results. Discovery keys are public pointers; business state is always read from Arkiv. Expiry may remove queryable entities, so creation transactions and the demo video should be inspected as bounded archived evidence.

## Tests

`npm test` includes positive and negative cases for exact binding, fake buyer/executor, owner transfer, old acceptance, wrong digest, proposal/delivery conflicts, duplicates, reordering, expiry, readonly flags, schema/type mismatch, foreign roots, incomplete/failed pages and inconsistent snapshot blocks. Browser acceptance is separately recorded; no claim of a real write is based on mocked tests.

## Originality and third-party work

All project core logic and Arkiv integration were written from scratch on 18 October 2026 during this event. No prior Agent3 application code, payment module, customer dataset or prior hackathon code was imported. There is no pre-event baseline SHA for reused first-party code because none was reused. The first repository commit records the initial event-period implementation.

Third-party dependencies: official Arkiv SDK, viem, Vite and their transitive dependencies under their own licences. The app's optional Google Fonts DM Sans / Space Grotesk are cosmetic resources, not required for verifier operation. The separately produced demo video uses self-hosted Space Grotesk and JetBrains Mono under OFL. AI coding assistance: OpenAI Codex (the interface did not expose a verified exact model ID, so no model revision is asserted).

## Licence

Original project code: MIT. Third-party software retains its upstream licence. Test records are synthetic; no personal data or hashes of personal data are stored in Arkiv.
