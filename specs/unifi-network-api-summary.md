
# UniFi Network API – Technical Summary

**What it is**: A versioned REST API (`/v1/...`) for managing UniFi Network resources on your controller.

**Why it matters**: Enables full automation for provisioning, monitoring, and policy management across sites and devices; ideal for Homey apps, middleware (IntegrationsMonkey), and DevOps workflows.

**Key Concepts**
- **Auth**: API Key via HTTP Bearer.
- **Filtering**: Powerful, URL-safe expressions for server-side filtering.
- **Pagination**: `offset`, `limit`, `count`, `totalCount`, `data`.
- **Error Model**: Machine-parsable fields (`statusCode`, `statusName`, `code`, `message`, `requestId`, ...).

**Primary Domains**
Sites, Devices (adopted/pending), Clients, Networks, WiFi Broadcasts, Hotspot Vouchers, Firewall Zones & Policies (incl. ordering), ACL Rules (incl. ordering), DNS Policies, Traffic Matching Lists, Supporting (WAN/VPN/RADIUS/DPI/Countries).

**Implementation Tips**
- Prefer idempotent operations and explicit scoping by `siteId`.
- Centralize error handling and retry logic around transient 5xx and rate/lock errors.
- Use pagination consistently; never assume all data fits on one page.
- For WiFi and firewall updates, pre-validate inputs to avoid disruptive provisioning cycles.
