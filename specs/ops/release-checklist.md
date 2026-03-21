# Release Checklist

> Created-by: Sonnet 4.6 | 2026-03-21

Use this checklist before every release to the Homey App Store.

---

## Pre-release

### Version Management

- [ ] Bump version in `.homeycompose/app.json`
- [ ] Bump version in `package.json` to **match exactly**
- [ ] Add changelog entry in `.homeychangelog.json` (key = new version, value = `{"en": "..."}`)
- [ ] Changelog entry is in English and describes user-visible changes
- [ ] Git tag matches version: `git tag v<version>`

```bash
# Verify versions match
node -e "const p=require('./package.json'),a=require('./app.json');console.log(p.version===a.version?'✅ versions match':'❌ VERSION MISMATCH',p.version,a.version)"
```

---

### Code Quality

- [ ] `npm run lint` — zero errors (warnings allowed)
- [ ] `npm test` — all tests pass
- [ ] `npm run format:check` — zero formatting errors
- [ ] No debug `console.log()` statements left in code
- [ ] No hardcoded credentials, IPs, or secrets in code

---

### Homey App Validation

```bash
homey app validate --level=publish
```

- [ ] Zero **blocking** errors
- [ ] Zero **warning** items (or all warnings are reviewed and accepted)
- [ ] Output logged to `specs/diagnostics/validate-<YYYYMMDD>.log`

---

### Functional Smoke Test

- [ ] App starts on Homey Pro without crash
- [ ] Settings page loads correctly
- [ ] Controller credentials test passes (`Test credentials` button)
- [ ] At least one Wi-Fi client pairs successfully
- [ ] Wi-Fi client connect/disconnect flow trigger fires on real event
- [ ] PoE power-cycle action executes without error (if switch is available)
- [ ] WebSocket status shows "Connected" on settings page
- [ ] No errors in Homey app logs during 5-minute observation period

---

### Security Review

- [ ] No credentials logged via `this.homey.log()`, `homey-log`, or `console.log()`
- [ ] `sslverify` setting is respected
- [ ] No new permissions added to `app.json` without documented justification
- [ ] `THREAT_MODEL.md` reviewed — no new high-severity threats introduced

---

## Build

```bash
# Rebuild app.json from .homeycompose (required before publish)
homey app build

# Verify generated app.json is up to date
git diff app.json
```

- [ ] `app.json` reflects all `.homeycompose/` changes
- [ ] No unexpected diffs in `app.json`

---

## Publish

### Option A — GitHub Actions (recommended)

1. Push changes to `main` branch.
2. Go to GitHub → Actions → **Homey Publish** workflow.
3. Click **Run workflow**.
4. Check output for publish URL.
5. Review app at the URL provided in `$GITHUB_STEP_SUMMARY`.

### Option B — Manual CLI

```bash
homey app publish
```

Requires `homey login` with a Homey account that has App Store developer access.

---

## Post-release

- [ ] Verify app appears in Homey App Store with correct version
- [ ] Test install from App Store on a clean Homey
- [ ] Monitor `homey-log` (Sentry) for crash spikes in first 24 hours
- [ ] Update `specs/diagnostics/validate-<date>.log` with final validation result
- [ ] Close all GitHub issues resolved in this release
- [ ] Announce in [Homey Community topic #42967](https://community.homey.app/t/42967)

---

## Versioning Convention

This project uses **Semantic Versioning** (`MAJOR.MINOR.PATCH`):

| Change type | Version bump | Example |
|---|---|---|
| Bug fix | PATCH | `2.5.5` → `2.5.6` |
| New feature (backwards compatible) | MINOR | `2.5.5` → `2.6.0` |
| Breaking change / major rewrite | MAJOR | `2.x.x` → `3.0.0` |

---

## Rollback

If a critical bug is discovered post-publish:

1. Fix the bug in a `hotfix/<description>` branch.
2. Bump PATCH version.
3. Follow full release checklist.
4. Contact Athom support if a previous version needs to be restored in the App Store.

