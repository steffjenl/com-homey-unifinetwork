# Decision Log

> Created-by: Sonnet 4.6 | 2026-03-21  
> Format: `YYYY-MM-DD | Title | ADR link`

All architectural decisions with lasting impact are captured here as one-liners; the linked ADR contains full rationale, trade-offs, and consequences.

---

| Date | Decision | ADR |
|---|---|---|
| 2026-03-21 | All specs and engineering comments are written in **English** | [ADR-0001](adrs/ADR-0001-language-and-specs.md) |
| 2026-03-21 | Runtime is **Node.js / CommonJS** — no migration to Python or ESM | [ADR-0002](adrs/ADR-0002-runtime-choice.md) |
| 2026-03-21 | Stay **CJS** for now; upgrade tsconfig target to node22; pin `node-unifi` to tagged release; remove V8 GC hack | [ADR-0003](adrs/ADR-0003-sdkv3-migration.md) |
| 2026-03-21 | **Dual-path auth**: `node-unifi` session-cookie (primary) + official `/v1/` Bearer API-key (v2.6 secondary); WebSocket-first event ingest with exponential backoff; `platforms: ["local"]` only | [ADR-0004](adrs/ADR-0004-unifi-network-integration-strategy.md) |

---

## Open Questions

| # | Question | Raised | Status |
|---|---|---|---|
| OQ-1 | When UniFi OS exposes a native WebSocket on the `/v1/` API path, should we migrate away from the legacy WS endpoint? | 2026-03-21 | Open |
| OQ-2 | Should `sslverify` default to `true` and break existing installs, or stay `false` with a prominent settings warning? | 2026-03-21 | Open |
| OQ-3 | Which UniFi OS version first exposes `EVT_WAN_*` events over WebSocket? Needs controller firmware research. | 2026-03-21 | Open |

