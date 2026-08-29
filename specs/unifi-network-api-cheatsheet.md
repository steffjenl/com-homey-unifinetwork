
# UniFi Network API – Endpoints Cheat Sheet

Base path: `/proxy/network/integration/v1/...` — endpoints below are relative to that base, shown as `/v1/...`. Auth via `X-API-KEY` header.

## Info
- GET `/v1/info`

## Sites
- GET `/v1/sites`

## Devices
- GET `/v1/sites/{siteId}/devices`
- POST `/v1/sites/{siteId}/devices` (adopt)
- POST `/v1/sites/{siteId}/devices/{deviceId}/actions`
- GET `/v1/sites/{siteId}/devices/{deviceId}`
- DELETE `/v1/sites/{siteId}/devices/{deviceId}`
- GET `/v1/sites/{siteId}/devices/{deviceId}/statistics/latest`

## Pending Devices
- GET `/v1/pending-devices`

## Clients
- GET `/v1/sites/{siteId}/clients`
- POST `/v1/sites/{siteId}/clients/{clientId}/actions`

## Networks
- GET `/v1/sites/{siteId}/networks`
- POST `/v1/sites/{siteId}/networks`
- GET `/v1/sites/{siteId}/networks/{networkId}`
- PATCH `/v1/sites/{siteId}/networks/{networkId}`
- DELETE `/v1/sites/{siteId}/networks/{networkId}`

## WiFi Broadcasts
- GET `/v1/sites/{siteId}/wifi/broadcasts`
- POST `/v1/sites/{siteId}/wifi/broadcasts`
- GET `/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}`
- PATCH `/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}`
- DELETE `/v1/sites/{siteId}/wifi/broadcasts/{wifiBroadcastId}`

## Hotspot Vouchers
- GET `/v1/sites/{siteId}/hotspot/vouchers`
- POST `/v1/sites/{siteId}/hotspot/vouchers`
- GET `/v1/sites/{siteId}/hotspot/vouchers/{voucherId}`
- DELETE `/v1/sites/{siteId}/hotspot/vouchers/{voucherId}`

## Firewall Zones & Policies
- GET `/v1/sites/{siteId}/firewall/zones`
- POST `/v1/sites/{siteId}/firewall/zones`
- GET `/v1/sites/{siteId}/firewall/zones/{firewallZoneId}`
- PATCH `/v1/sites/{siteId}/firewall/zones/{firewallZoneId}`
- DELETE `/v1/sites/{siteId}/firewall/zones/{firewallZoneId}`
- GET `/v1/sites/{siteId}/firewall/policies`
- POST `/v1/sites/{siteId}/firewall/policies`
- GET `/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}`
- PATCH `/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}`
- DELETE `/v1/sites/{siteId}/firewall/policies/{firewallPolicyId}`
- GET `/v1/sites/{siteId}/firewall/policies/ordering`
- POST `/v1/sites/{siteId}/firewall/policies/ordering`

## ACL Rules
- GET `/v1/sites/{siteId}/acl-rules`
- POST `/v1/sites/{siteId}/acl-rules`
- GET `/v1/sites/{siteId}/acl-rules/{aclRuleId}`
- PATCH `/v1/sites/{siteId}/acl-rules/{aclRuleId}`
- DELETE `/v1/sites/{siteId}/acl-rules/{aclRuleId}`
- GET `/v1/sites/{siteId}/acl-rules/ordering`
- POST `/v1/sites/{siteId}/acl-rules/ordering`

## DNS Policies
- GET `/v1/sites/{siteId}/dns/policies`
- POST `/v1/sites/{siteId}/dns/policies`
- GET `/v1/sites/{siteId}/dns/policies/{dnsPolicyId}`
- PATCH `/v1/sites/{siteId}/dns/policies/{dnsPolicyId}`
- DELETE `/v1/sites/{siteId}/dns/policies/{dnsPolicyId}`

## Traffic Matching Lists
- GET `/v1/sites/{siteId}/traffic-matching-lists`
- POST `/v1/sites/{siteId}/traffic-matching-lists`
- GET `/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}`
- PATCH `/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}`
- DELETE `/v1/sites/{siteId}/traffic-matching-lists/{trafficMatchingListId}`

## Supporting Resources
- GET `/v1/sites/{siteId}/wans`
- GET `/v1/sites/{siteId}/vpn/servers`
- GET `/v1/sites/{siteId}/vpn/site-to-site-tunnels`
- GET `/v1/sites/{siteId}/radius/profiles`
- GET `/v1/sites/{siteId}/device-tags`
- GET `/v1/dpi/categories`
- GET `/v1/dpi/applications`
- GET `/v1/countries`
