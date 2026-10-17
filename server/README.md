# Optional Arkiv read gateway

The direct browser path encountered HTTP 429 `ANON_COST_LIMITED` during real acceptance. Reducing browser request count is implemented, but the same browser quota still rejected a single-page query. Official access-key guidance says a key raises RPC limits and must stay out of browser code: https://docs.arkiv.network/start-here/access-keys/

`gateway.mjs` is a prepared, **not deployed** alternative transport. It forwards only bounded Handoff Lens reads to the official Tiramisu RPC. It is not a business database and does not make handoff decisions. Direct independent queries remain available through `scripts/reproduce.mjs` and the public-RPC mode.

- Secret is read from server-only `ARKIV_RPC_KEY`; never a Vite variable, URL, repository file or browser bundle.
- Upstream is fixed to the official Tiramisu URL and the key is sent in `X-API-KEY`.
- Allowed methods: eth_chainId, eth_blockNumber and project-scoped arkiv_query only. No signing, writes, transactions or RPC batches.
- Requires explicit ALLOWED_ORIGINS. Origin is attribution, not authentication; non-browser clients can forge it. A per-connection-IP memory rate limit bounds quota consumption; production needs an appropriate shared edge limit if deployed behind multiple instances.
- Query page size is bounded to 50. Bodies are capped at 16 KiB. Cursors are bounded. Unknown or unscoped queries are refused.
- No keys, request bodies or IP logs. Upstream failures stay failures; no fixture or stored-record fallback.

Local configuration uses the environment or an approved server secret manager. A bind address of 127.0.0.1 is the default. Public deployment requires a separate HTTPS reverse proxy or serverless adaptation and verified CORS, quota and lifecycle configuration. No public service or secret has been created by this preparation.

`npm test` covers allowed requests, blocked transaction methods, blocked batch/unscoped/overlarge queries, denied browser origins, actual localhost HTTP forwarding and explicit gateway quota failure. It uses a mock upstream, so it does not certify a real keyed Arkiv connection.
