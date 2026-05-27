# Maintenance Tooling Analysis

Status: future feature proposal.

Gitpulse previously had a `maintenance visibility` composite metric based partly
on documentation file presence. That metric is retired. The current
implementation exposes documentation presence through `gitpulse docs`; see
[Docs Command](../DOCS_COMMAND.md).

This proposal describes a replacement maintenance composite based on
deterministic dependency and tooling signals rather than documentation
presence.

## Product Direction

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

Any `deprecated` or `unsupported` classification must be source-backed. Good
sources include registry metadata, official runtime EOL schedules, or a curated
Gitpulse table with an explicit update policy. Avoid treating `old` as
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
  systems.

Then add registry-specific adapters one ecosystem at a time. npm is the most
natural first adapter for this codebase, but the design should leave room for
other ecosystems.

Registry adapters should be cached separately from repository snapshots so
Gitpulse does not repeatedly hit package registries during comparisons.

## Metric Sketch

Do not freeze final weights until the collector has been tested across real
repositories. A possible composite could be named `maintenance tooling` and
expose inputs such as:

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

## Implementation Sequence

1. Add maintenance-tooling discovery types and GitHub file discovery.
2. Add one registry adapter, likely npm first.
3. Define and document the replacement composite formula after sample testing.

## Non-Goals

- Do not add AI summaries for documentation or maintenance.
- Do not run package-manager installs inside inspected repositories.
- Do not present dependency freshness as a security audit.
- Do not claim that newer tooling always means better maintenance.
- Do not block current `gitpulse docs` behavior on this composite.
