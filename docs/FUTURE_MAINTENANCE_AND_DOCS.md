# Future Maintenance Analysis and Docs Command

## Status

This document records the completed split between documentation reporting and
default pulse output, plus the future plan for a tooling-based maintenance
composite.

The retired `maintenance visibility` composite metric was based partly on
documentation file presence. That made the metric easy to compute, but it mixed
two different questions:

- "Can I inspect this project's docs quickly?"
- "Does this project look technically maintained?"

Gitpulse now separates those concerns.

## Product Decisions

1. Retire the documentation-based `maintenance visibility` composite metric.
2. Stop showing documentation presence in default human-readable `repo` and
   `compare` output.
3. Use a dedicated documentation command:

```bash
gitpulse docs owner/name
```

4. Reintroduce a maintenance composite only after Gitpulse collects
   deterministic maintenance-tooling signals.

Until the replacement exists, the default human-readable pulse should show
activity and community composites only.

## Default Output

The default human-readable repository report does not include:

- The `Maintenance visibility` score.
- A `Documentation` section.

The default human-readable comparison report does not include:

- A `Maintenance` scoreboard column.
- A `Docs` scoreboard column.
- A `Documentation` comparison section.

The removal of `maintenanceVisibility` from JSON shipped as a schema-versioned
change. Repository, docs, and comparison JSON envelopes now use schema version
`3`.

## `gitpulse docs`

`gitpulse docs <repo>` is the focused surface for documentation discovery.

Command shape:

```bash
gitpulse docs owner/name
gitpulse docs owner/name --json
gitpulse docs owner/name --refresh
gitpulse docs owner/name --offline
```

The command supports the same cache, color, and JSON conventions as
the root repository report.

`gitpulse docs` does not have a separate documentation-only cache or
documentation-only refresh path. It renders the documentation slice from
the shared repository snapshot used by root repository and comparison reports.
When users pass `--refresh`, Gitpulse performs the same unified repository
snapshot refresh as `gitpulse owner/name --refresh`, then displays only documentation
signals.

Human output shows:

- Repository identity.
- README presence and path.
- Changelog presence and path.
- Contributing guide presence and path.
- Code of conduct presence and path.
- Security policy presence and path.
- A `Data Provenance` section with fetched/source details and any warnings or partial fetch failures.

Later iterations may add release notes, issue templates, pull request templates,
funding files, governance docs, or docs directories. Those should be added as
explicit documented signals.

The docs command does not evaluate documentation quality in Phase 1. It reports
deterministic presence and paths only.

## Future Maintenance Analysis

A replacement maintenance composite should answer:

> Does the repository's declared dependency and tooling surface show evidence of
> active upkeep and supported baselines?

It should not use documentation presence as an input.

Candidate signal groups:

| Signal group | Example inputs |
| --- | --- |
| Dependency freshness | Manifest files, lockfiles, registry latest versions, registry deprecation flags, major-version lag |
| Runtime support | Declared Node/Python/Go/Rust/etc. versions, EOL runtime versions, package-manager pins |
| Tooling currency | Deprecated linters/build tools, current CI action majors, supported package managers |
| Update automation | Dependabot config, Renovate config, scheduled update workflows |
| File upkeep recency | Recent changes to manifests, lockfiles, workflow files, release automation files |

Any "deprecated" or "unsupported" classification must be source-backed. Good
sources include registry metadata, official runtime EOL schedules, or a curated
Gitpulse table with an explicit update policy. Avoid treating "old" as
automatically bad without a source that says it is unsupported or deprecated.

## Data Collection Plan

Start with repository file discovery through GitHub APIs:

- Root manifests: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`,
  `Gemfile`, `composer.json`, and similar files.
- Lockfiles: `bun.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`,
  `uv.lock`, `poetry.lock`, `Cargo.lock`, `go.sum`, `Gemfile.lock`, and similar
  files.
- Toolchain files: `.nvmrc`, `.node-version`, `rust-toolchain.toml`,
  `.python-version`, `.tool-versions`, `mise.toml`, and similar files.
- Automation files: `.github/dependabot.yml`, `.github/dependabot.yaml`,
  Renovate config files, and scheduled workflow files.
- CI files: `.github/workflows/*` initially, with room for other forge CI
  systems later.

Then add registry-specific adapters one ecosystem at a time. npm is the most
natural first adapter for this codebase, but the design should leave room for
other ecosystems.

Registry adapters should be cached separately from repository snapshots so
Gitpulse does not repeatedly hit package registries during comparisons.

## Metric Sketch

Do not freeze final weights until the collector has been tested across real
repositories. A possible future composite could be named `maintenance tooling`
and expose inputs such as:

- `dependenciesChecked`
- `outdatedMajorDependencies`
- `deprecatedDependencies`
- `eolRuntimeDeclarations`
- `supportedRuntimeDeclarations`
- `updateAutomationPresent`
- `staleManifestDays`
- `staleLockfileDays`
- `ciWorkflowCount`
- `staleWorkflowDays`

The score should remain explainable, rounded to `0-100`, and labeled with the
same bands documented for the existing composites.

## Implemented Baseline

- `gitpulse owner/name` no longer displays documentation presence or a
  documentation-based maintenance score.
- `gitpulse owner/a owner/b` no longer displays docs or maintenance
  columns based on docs.
- `gitpulse docs owner/name` displays documentation presence and paths.
- `gitpulse docs owner/name --refresh` performs a unified repository snapshot
  refresh and then renders the docs slice.
- JSON schema changes are versioned and documented.
- `docs/COMPOSITE_METRICS.md`, `README.md`, and tests are updated in the same
  implementation change that alters behavior.

## Future Implementation Sequence

1. Add maintenance-tooling discovery types and GitHub file discovery.
2. Add one registry adapter, likely npm first.
3. Define and document the replacement composite formula after sample testing.

## Non-Goals

- Do not add AI summaries for documentation or maintenance.
- Do not run package-manager installs inside inspected repositories.
- Do not present dependency freshness as a security audit.
- Do not claim that newer tooling always means better maintenance.
- Do not block docs command implementation on the future maintenance composite.
- Do not introduce a separate documentation-only cache or partial refresh mode.
