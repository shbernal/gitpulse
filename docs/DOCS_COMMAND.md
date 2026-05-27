# Docs Command

## Status

`gitpulse docs <repo>` is the current focused surface for documentation
discovery.

Documentation signals are intentionally not shown in the default repository or
comparison reports. The docs command keeps that information available without
making the main pulse output wider or noisier.

## Command Shape

```bash
gitpulse docs owner/name
gitpulse docs owner/name --json
gitpulse docs owner/name --refresh
gitpulse docs owner/name --offline
```

The command accepts explicit `owner/name` references and the same exact local
repository shorthand accepted by the root repository command.

## Data Source And Cache

`gitpulse docs` reads the documentation slice from the shared repository
snapshot used by root repository and comparison reports. It does not have a
separate documentation-only cache or documentation-only refresh path.

When users pass `--refresh`, Gitpulse performs the same unified repository
snapshot refresh as `gitpulse owner/name --refresh`, then renders only the
documentation signals.

The command supports the same cache, color, theme, and JSON conventions as the
root repository report.

## Reported Signals

Human output shows:

- Repository identity.
- README presence and path.
- Changelog presence and path.
- Contributing guide presence and path.
- Code of conduct presence and path.
- Security policy presence and path.
- A `Data Provenance` section with fetched/source details and any warnings or
  partial fetch failures.

JSON output uses schema version `5`, command name `docs`, and a focused result
payload containing repository identity, fetch time, documentation signals, and
warnings.

## Non-Goals

- Do not evaluate documentation quality in Phase 1.
- Do not add AI summaries for documentation.
- Do not introduce a separate documentation-only cache.
- Do not use documentation presence as a maintenance composite input.
