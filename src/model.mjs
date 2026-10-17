import { keccak256, toBytes } from "viem";
export const APP = "agent3-handoff-lens-v1";
export const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
const addr = (v) => /^0x[0-9a-f]{40}$/i.test(v ?? "");
const key = (v) => /^0x[0-9a-f]{64}$/i.test(v ?? "");
export const digest = (text) => keccak256(toBytes(text)); // Synthetic test deliverables only.
export function normalize(e) {
  return {
    key: e.key,
    creator: e.creator,
    owner: e.owner,
    createdAt: String(e.createdAt),
    expiresAt: String(e.expiresAt),
    readonly: e.creationFlags?.readonly === true,
    attributes: Object.fromEntries(
      Object.entries(e.attributes ?? {}).map(([k, v]) => [
        k,
        {
          type: v.type,
          value: typeof v.value === "bigint" ? String(v.value) : v.value,
        },
      ]),
    ),
    payload: e.toJson(),
  };
}
export function evaluate(records, rootKey, block, { complete = true } = {}) {
  const rejected = [];
  const reject = (e, reason) =>
    rejected.push({ key: e?.key ?? "unknown", reason });
  if (!complete)
    return {
      state: "UNVERIFIABLE",
      reason: "Query incomplete. No completion decision.",
      rejected,
    };
  if (!Array.isArray(records) || !key(rootKey) || !/^\d+$/.test(String(block)))
    return { state: "UNVERIFIABLE", reason: "Invalid query input.", rejected };
  const seen = new Map();
  for (const e of records) {
    const id = String(e?.key).toLowerCase();
    if (seen.has(id) && JSON.stringify(seen.get(id)) !== JSON.stringify(e))
      return {
        state: "UNVERIFIABLE",
        reason: "Conflicting response for one entity key.",
        rejected,
      };
    seen.set(id, e);
  }
  const all = [...seen.values()];
  const root = all.find((e) => same(e.key, rootKey));
  const valid = (e) => {
    if (
      !key(e.key) ||
      !addr(e.creator) ||
      !e.readonly ||
      !/^\d+$/.test(e.createdAt ?? "") ||
      !/^\d+$/.test(e.expiresAt ?? "") ||
      BigInt(e.expiresAt) <= BigInt(block)
    ) {
      reject(e, "missing, mutable or expired entity");
      return false;
    }
    const a = e.attributes,
      p = e.payload;
    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      a?.app?.type !== "str" ||
      a.app.value !== APP ||
      a.kind?.type !== "str" ||
      !["proposal", "delivery", "acceptance"].includes(a.kind.value) ||
      a.version?.type !== "i32" ||
      !Number.isInteger(a.version.value) ||
      a.version.value < 1 ||
      a.task?.type !== "str" ||
      !/^demo-[a-z0-9-]{1,64}$/.test(a.task.value) ||
      p.kind !== a.kind.value ||
      p.version !== a.version.value ||
      p.task !== a.task.value
    ) {
      reject(e, "invalid schema or attribute/payload mismatch");
      return false;
    }
    return true;
  };
  if (
    !root ||
    !valid(root) ||
    root.payload.kind !== "proposal" ||
    root.payload.version !== 1 ||
    root.payload.rootKey !== null ||
    !addr(root.payload.executor) ||
    same(root.creator, root.payload.executor)
  )
    return {
      state: "UNVERIFIABLE",
      reason:
        "Root unavailable or invalid. Buyer authority cannot be established.",
      rejected,
    };
  const buyer = root.creator,
    executor = root.payload.executor,
    task = root.payload.task;
  const ok = [];
  for (const e of all) {
    if (same(e.key, rootKey)) {
      ok.push(e);
      continue;
    }
    if (!valid(e)) continue;
    const p = e.payload;
    if (p.task !== task || !same(p.rootKey, rootKey)) {
      reject(e, "different task or root");
      continue;
    }
    if (p.kind === "proposal") {
      if (
        !same(e.creator, buyer) ||
        !same(p.executor, executor) ||
        p.version === 1
      ) {
        reject(e, "unauthorized proposal or changed executor");
        continue;
      }
    } else if (p.kind === "delivery") {
      if (!same(e.creator, executor)) {
        reject(e, "creator is not authorized executor");
        continue;
      }
      if (!key(p.proposalKey) || !key(p.digest)) {
        reject(e, "invalid delivery reference");
        continue;
      }
    } else {
      if (!same(e.creator, buyer)) {
        reject(e, "creator is not authorized buyer");
        continue;
      }
      if (!key(p.proposalKey) || !key(p.deliveryKey) || !key(p.digest)) {
        reject(e, "invalid acceptance reference");
        continue;
      }
    }
    ok.push(e);
  }
  const proposals = ok.filter((e) => e.payload.kind === "proposal");
  const version = Math.max(...proposals.map((e) => e.payload.version));
  const current = proposals.filter((e) => e.payload.version === version);
  const base = {
    buyer,
    executor,
    task,
    version,
    rejected,
    rootKey,
    observedBlock: String(block),
  };
  // Any valid buyer-authored version branch at any version remains a dispute until explicitly resolved out of scope.
  const counts = new Map();
  for (const p of proposals)
    counts.set(p.payload.version, (counts.get(p.payload.version) || 0) + 1);
  if ([...counts.values()].some((n) => n > 1))
    return {
      ...base,
      state: "CONFLICT",
      reason:
        "Buyer published competing proposals at one version. Human resolution required.",
    };
  const proposal = current[0],
    deliveries = [];
  for (const e of ok.filter((e) => e.payload.kind === "delivery")) {
    if (
      e.payload.version !== version ||
      !same(e.payload.proposalKey, proposal.key)
    ) {
      reject(e, "delivery references an older or different proposal");
      continue;
    }
    deliveries.push(e);
  }
  const variants = new Set(
    deliveries.map((e) => e.payload.digest.toLowerCase()),
  );
  if (variants.size > 1)
    return {
      ...base,
      proposal,
      state: "CONFLICT",
      reason:
        "Executor published conflicting delivery digests. No last-write-wins.",
    };
  const matches = [];
  for (const e of ok.filter((e) => e.payload.kind === "acceptance")) {
    const p = e.payload,
      d = deliveries.find((d) => same(d.key, p.deliveryKey));
    if (
      p.version !== version ||
      !same(p.proposalKey, proposal.key) ||
      !d ||
      !same(p.digest, d.payload.digest)
    ) {
      reject(
        e,
        "acceptance does not bind current proposal and exact delivery digest",
      );
      continue;
    }
    // Creation heights are the observed order bound; same-block ordering is not needed for exact key references.
    if (
      BigInt(e.createdAt) < BigInt(d.createdAt) ||
      BigInt(d.createdAt) < BigInt(proposal.createdAt)
    ) {
      reject(e, "impossible reference creation order");
      continue;
    }
    matches.push(e);
  }
  if (matches.length)
    return {
      ...base,
      proposal,
      deliveries,
      acceptances: matches,
      state: "ACCEPTED",
      reason:
        "Authorized buyer accepted this exact current delivery. This is a statement, not a quality or payment proof.",
    };
  return {
    ...base,
    proposal,
    deliveries,
    state: deliveries.length ? "AWAITING_ACCEPTANCE" : "AWAITING_DELIVERY",
    reason: deliveries.length
      ? "Executor claimed delivery. Buyer has not accepted it."
      : "No authorized delivery for the current proposal.",
  };
}
