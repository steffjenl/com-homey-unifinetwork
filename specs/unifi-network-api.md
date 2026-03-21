
# UniFi Network API – Developer Documentation

## Overview
The UniFi Network API exposes endpoints for sites, devices, clients, networks, WiFi broadcasts (SSIDs), hotspot vouchers, firewall zones and policies, DNS policies, ACL rules, traffic matching lists, and various supporting resources (WAN, VPN, RADIUS, DPI, countries). All endpoints run locally on the UniFi Network application (UDM/UDR/UDM-SE/etc.) and share a consistent design (`/v1/...`).

## Authentication
Authentication is performed with an **API key** configured in the UniFi Network application (Integrations). Use a standard **HTTP Bearer** token header.

```
Authorization: Bearer <API_KEY>
```

## Filtering
Many list endpoints support an advanced `filter` query parameter. The expression language supports:
- **Property expressions**: `<property>.<function>(<args>)`
- **Compound expressions**: `and(<expr1>, <expr2>)`, `or(...)`
- **Negation**: `not(<expr>)`

Supported data types: `STRING`, `INTEGER`, `DECIMAL`, `TIMESTAMP`, `BOOLEAN`, `UUID`, `SET`.

Common functions: `isNull`, `isNotNull`, `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `like`, `in`, `notIn`, `isEmpty`, `contains`, `containsAny`, `containsAll`, `containsExactly`.

## Error Handling
Standard error shape:
```json
{
  "statusCode": 400,
  "statusName": "UNAUTHORIZED",
  "code": "api.authentication.missing-credentials",
  "message": "Missing credentials",
  "timestamp": "2024-11-27T08:13:46.966Z",
  "requestPath": "/integration/v1/sites/123",
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

## Pagination Pattern
Most list endpoints return a paginated envelope:
```json
{ "offset": 0, "limit": 25, "count": 10, "totalCount": 1000, "data": [ ... ] }
```

## Resource Groups & Key Endpoints (high level)
- **Info**: `GET /v1/info`
- **Sites**: `GET /v1/sites`
- **Devices**: `GET /v1/sites/{siteId}/devices`, `POST /v1/sites/{siteId}/devices` (adopt), `POST /v1/sites/{siteId}/devices/{deviceId}/actions`, `GET/DELETE /v1/sites/{siteId}/devices/{deviceId}`, statistics endpoints
- **Pending Devices**: `GET /v1/pending-devices`
- **Clients**: `GET /v1/sites/{siteId}/clients`, `POST /v1/sites/{siteId}/clients/{clientId}/actions`
- **Networks**: `GET/POST /v1/sites/{siteId}/networks`, `GET/PATCH/DELETE /v1/sites/{siteId}/networks/{networkId}`
- **WiFi Broadcasts**: `GET/POST /v1/sites/{siteId}/wifi/broadcasts`, `GET/PATCH/DELETE /v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}`
- **Hotspot Vouchers**: `GET/POST /v1/sites/{siteId}/hotspot/vouchers`, `GET/DELETE /v1/sites/{siteId}/hotspot/vouchers/{voucherId}`
- **Firewall**: zones (`/firewall/zones`), policies (`/firewall/policies`, ordering)
- **ACL Rules**: `/acl-rules`, ordering
- **DNS Policies**: `/dns/policies`
- **Traffic Matching Lists**: `/traffic-matching-lists`
- **Supporting**: `/wans`, `/vpn/*`, `/radius/profiles`, `/device-tags`, `/v1/dpi/categories`, `/v1/dpi/applications`, `/v1/countries`

## Notes
- Versioned paths (e.g., `/v1/...`)
- Rich, URL-safe filtering expressions
- Consistent, automation-friendly responses
