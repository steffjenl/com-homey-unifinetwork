# Specs — Ubiquiti UniFi Network Homey App

> Created-by: Sonnet 4.6 | 2026-03-21

This folder contains **all engineering specifications, ADRs, integration notes, and quality rails** for the `com.ubnt.unifi` Homey app.  
It is the single source of truth for AI-assisted development and human contributors alike.

---

## Project Overview

| Field | Value |
|---|---|
| App ID | `com.ubnt.unifi` |
| App version | `2.5.5` |
| SDK | Homey Apps SDK **v3** |
| Runtime | **Node.js / CommonJS** (CJS) |
| Homey platforms | `local` (Homey Pro 2019/2023/2026, Self-Hosted) |
| Homey compatibility | `>=5.0.0` |
| Integration target | **Ubiquiti UniFi Network** (UniFi OS controller + self-hosted) |
| Repo | https://github.com/steffjenl/com-homey-unifinetwork |

---

## Goals

1. **Presence detection** — trigger Homey flows when Wi-Fi / cable clients connect or disconnect.
2. **Network control** — block/unblock clients, PoE power-cycle / on / off switch ports, toggle WLANs.
3. **Awareness flows** — first/last device on AP, roaming events, signal changes, guest detection.
4. **Future (v2.6)** — dual-path auth (session-cookie via `node-unifi` + Bearer API-key via official `/v1/` REST API), WAN up/down triggers, IDS/IPS alert triggers, WLAN toggle action.

---

## SDK v3 Status

| Check | Status |
|---|---|
| `"sdk": 3` in `app.json` | ✅ |
| `"sdk": 3` in `.homeycompose/app.json` | ✅ |
| Uses `this.homey.*` managers | ✅ |
| Homey Compose plugin active | ✅ |
| `Homey.App` / `Homey.Driver` / `Homey.Device` class hierarchy | ✅ |
| ESM (`"type": "module"`) | ❌ — CJS kept by decision (see ADR-0003) |
| `tsconfig.json` targets Node 22 | ❌ — still `@tsconfig/node12` (fix tracked in TODO-006) |
| `package.json` version == `app.json` version | ❌ — `2.3.6` vs `2.5.5` (fix tracked in TODO-006) |
| ESLint / Prettier configured | ❌ — tracked in TODO-005 |
| Test suite | ❌ — tracked in TODO-005 |

---

## Supported Homey Platforms

- Homey Pro (2019) — local only, port 8443 or 443
- Homey Pro (2023 / 2026 / mini) — local only
- Self-Hosted Homey — local only

Cloud platform is **out of scope** (see ADR-0002); it would require relay architecture for controllers behind NAT.

---

## UniFi Network Scope

| Device class | Supported |
|---|---|
| Wi-Fi clients | ✅ `wifi-client` driver |
| Cable/wired clients | ✅ `cable-client` driver |
| Access Points (UAP) | ✅ `access-point` driver |
| Network Switches (USW) with PoE | ✅ `network-switch` driver |
| Gateways / UDM / UXG | ⚠️ Discovery only — no dedicated driver yet |
| WAN monitoring | ❌ Planned v2.6 |
| IDS/IPS alerts | ❌ Planned v2.6 |

---

## Folder Map

```
specs/
├── README.md                        ← this file
├── DECISIONS.md                     ← rolling decision log
├── adrs/                            ← Architecture Decision Records
│   ├── ADR-0000-template.md
│   ├── ADR-0001-language-and-specs.md
│   ├── ADR-0002-runtime-choice.md
│   ├── ADR-0003-sdkv3-migration.md
│   └── ADR-0004-unifi-network-integration-strategy.md
├── migration/
│   └── sdkv3-migration-plan.md
├── testing/
│   └── test-plan.md
├── quality/
│   └── lint-format.md
├── security/
│   └── THREAT_MODEL.md
├── integration/
│   ├── index.json
│   └── unifi-network/
│       ├── api-notes.md
│       ├── device-matrix.md
│       ├── flow-cards.md
│       ├── rate-limits-and-events.md
│       └── compatibility.md
├── ops/
│   └── release-checklist.md
├── tasks/
│   └── TODO.md
└── diagnostics/
    ├── fixlist.md
    └── validate-20260321.log
```

---

## How to Run Locally

### Prerequisites

```bash
npm install -g homey
npm install
```

### Run on Homey (USB / Wi-Fi)

```bash
homey app run
```

### Validate without deploying

```bash
homey app validate --level=publish
```

### Debug (attach Chrome DevTools)

```bash
homey app run --clean
# Open chrome://inspect in Chrome browser
```

---

## How to Publish

1. Bump version in `.homeycompose/app.json` and `package.json` (keep in sync).
2. Update `.homeychangelog.json` with release notes.
3. Run `homey app validate --level=publish` — must be zero blocking errors.
4. Push to `main` — GitHub Action `homey-publish.yml` triggers on `workflow_dispatch`.
5. Or manually: `homey app publish`.

See full checklist: [`specs/ops/release-checklist.md`](ops/release-checklist.md).

---

## Next Steps

See [`specs/tasks/TODO.md`](tasks/TODO.md) for the prioritised backlog (≤ 12 items with acceptance criteria).

