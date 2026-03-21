# ADR-0001 — All Specifications in English

- **Status**: Accepted
- **Date**: 2026-03-21
- **Deciders**: Stèphan Eizinga, Sonnet 4.6
- **Tags**: conventions, documentation

---

## Context and Problem Statement

The repository has contributors and users across multiple locales (NL, EN, ES, DE, …).  
App UI strings are already fully internationalised via `locales/*.json`.  
Engineering artefacts (specs, ADRs, comments, PR descriptions) are currently a mix of Dutch and English, creating friction for AI tooling and international contributors.

---

## Decision Drivers

- AI coding assistants (GitHub Copilot, Claude, etc.) perform best with English context.
- Homey App Store requires English as the primary locale for listings and changelogs.
- Future open-source contributors are more likely to read English.
- Dutch is still valuable for in-code developer comments where nuance helps the local team.

---

## Considered Options

1. **English only for all artefacts**
2. **Dutch only for all artefacts**
3. **English for `specs/` and `docs/`; Dutch optional for inline code comments**

---

## Decision Outcome

**Chosen option: Option 3** — English for all files in `specs/`, `docs/`, and commit messages.  
Inline code comments may be Dutch where that genuinely aids clarity for the primary maintainer.

### Positive Consequences

- AI tooling gets full English context.
- International contributors can participate.
- Homey App Store descriptions stay consistent with repo docs.

### Negative Consequences / Trade-offs

- Primary maintainer (Dutch) must write specs in a second language.  
  Mitigation: AI tooling makes this low-effort.

---

## Links

- [Conventional Commits](https://www.conventionalcommits.org/) — commit message standard used in this repo

