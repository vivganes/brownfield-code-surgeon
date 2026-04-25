# Surgical Plan

## Patient
Demo repo (toy backend simulation).

## Request
"Add MFA support to authentication, preserving existing session semantics."

## Phases
1. **plan** — sketch approach
2. **map** — identify seams & dependencies
3. **break** — introduce seams
4. **cover** — add characterization tests
5. **implement** — apply change
6. **refactor** — clean up
7. **finish** — docs & verify

## Risks
- Auth touches every request path
- Session token format must remain backwards-compatible
