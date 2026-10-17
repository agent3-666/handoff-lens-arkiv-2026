# Handoff Lens data contract v1

SDK `@arkiv-network/sdk` **0.8.1**. Network **Tiramisu 7738577**. Primary and only business data layer: Arkiv. The app is static and directly queries the public RPC by default. An optional read-only key-protected gateway is prepared for rate-limit handling but not deployed. The optional discovery manifest contains entity keys, not authoritative business state.

## Trust and data types

Every supported record has `flags: {readonly:true, permissionlessExtension:true}`. Readonly freezes attributes/payload, not deletion or ownership. The app requires the returned readonly creation flag. `$creator` is immutable and is the only author identity. `$owner` may transfer and is never used for authentication.

All examples and write UI inputs are synthetic. No names, emails, secrets, real personal data or hashes of personal data are written. A digest is keccak256 of a fixed synthetic numbered-report string, not a personal identifier or payment proof. There is no private-data upload or general free-text form.

| Attribute | Type | Purpose |
|---|---|---|
| app | str | `agent3-handoff-lens-v1`, app namespace |
| task | str | `demo-` plus synthetic random identifier, task equality filter |
| kind | str | proposal / delivery / acceptance |
| version | i32 | positive task revision, numeric range filtering |

Payload is JSON, not queryable. All four attributes must agree with matching payload fields (app is the namespace attribute). Unknown types or mismatches are rejected. Keys are 32-byte hex. Wallets are 20-byte hex.

## Entity types and Entity Expiration

| Type | Author | Payload | Requested lifetime |
|---|---|---|---|
| Root proposal | buyer `$creator` | kind, task, version=1, rootKey=null, executor, synthetic summary | 14 days |
| Revised proposal | same root buyer | kind, task, version>=2, rootKey, unchanged executor, synthetic summary | 14 days |
| Delivery claim | root-designated executor | kind, task, version, rootKey, proposalKey, synthetic digest | 10 days |
| Buyer acceptance | root buyer | kind, task, version, rootKey, proposalKey, exact deliveryKey and digest | 7 days |

The task remains discoverable longer than a particular delivery; an acceptance has a short dispute window. Duration helpers convert to nominal 2-second blocks, so durations are approximate. UX checks actual returned `expiresAt` against snapshot block. `expiresAt` is a block height, never treated as Unix time.

Permissionless Lifetime Extension lets observers keep a dispute record readable without gaining write rights. The app does not claim to have executed extension until an evidence record shows it. Owners can still delete any entity; the app does not prove a complete historical ledger. Snapshot decisions are bounded to currently available records. Transactions/video archive creation facts for judging; they are not permanent query storage.

## Queries used by the app

See `src/arkiv.mjs` for the complete executable implementation.

```js
const block = await client.getBlockNumber();
// Root is identified by a user-chosen trusted key, not by a mutable role string.
const root = await client.select()
  .where(eq('$key', key(rootKey))).atBlock(block).limit(1).fetch();
// task is decoded from the root and schema-checked.
let page = await client.select()
  .where(eq('app', APP), eq('task', task), gte('version', i32(1)))
  .atBlock(block).limit(50).fetch();
// Browser default: 50 records/page. Optional audit mode uses 2.
// Walk every page via page.next(), with a 50-page cap and same-block assertions.
// Any page failure or cap leaves the result unverifiable. Never decide from partial pages.
```

Creator-filter probe (not substituted for the full task query, so the UI can explain outsider attempts):

```js
client.select().where(eq('app', APP))
  .createdBy(buyerAddress).atBlock(block).limit(2)
```

The discovery manifest may provide an untrusted task name to avoid a separate root lookup. In that path, the root must still be returned inside the exact same complete live task query; a wrong hint fails closed. No status or authority is read from the manifest.

Every query field is selected because the verifier uses keys, creator, creation height, expiry height, creation flags, attributes and JSON payload. The app exposes the exact query, page counts, snapshot block and downloadable observation.

## State derivation

1. Root must be available, schema-valid, readonly, live at snapshot and version 1. Its creator is the buyer; executor must be a different wallet. The root key must be verified by the user out of band. A wallet does not identify a real human.
2. Revisions must be created by that buyer and keep the root executor. Highest valid numeric version is current. Multiple buyer proposals at any one version are a conflict requiring human review, including older branches.
3. Only designated-executor deliveries for the current proposal qualify. Multiple distinct digests produce conflict. Duplicate same-digest statements are harmless; exact duplicate entity responses are deduplicated; conflicting data for one key makes the whole observation unverifiable.
4. Only root-buyer acceptance for the current proposal, exact delivery entity key and exact digest qualifies. Creation heights must allow the reference order. An arbitrary `role` payload field has no authority.
5. No authorized delivery -> AWAITING_DELIVERY. Delivery without matching buyer acceptance -> AWAITING_ACCEPTANCE. Exact matching statements -> ACCEPTED. Missing root/incomplete RPC -> UNVERIFIABLE. Explicit branch/digest disagreements -> CONFLICT.

No ACCEPTED result proves content quality, actual payment, legal identity, historical completeness or legal enforceability. No delegated role resolution, cancellation, key recovery or dispute arbitration is implemented.
